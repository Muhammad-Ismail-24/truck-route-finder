"""Tests for backend/api endpoints and exception handling.

Covers:
  - GET /api/v1/health (Section 15.1)
  - GET /api/v1/geocode/suggest (Section 15.2, D-22)
  - POST /api/v1/plan happy path shape (Section 15.3)
  - Validation errors per field: lat/lng bounds, origin/destination < 1 mi apart
  - Boundary values: load 1, 80000, 80001, 0, interval 20, 10, 25, 50
  - Departure window: beyond 60 min past grace, > 7 days ahead, timezone awareness
  - Standardized error codes & status mappings (Section 15.4):
      VALIDATION_ERROR (400)
      NO_ROUTE_FOUND (422)
      UPSTREAM_ROUTING_ERROR (502)
      UPSTREAM_WEATHER_ERROR (502)
      RATE_LIMITED (429)
      INTERNAL_ERROR (500, no stack trace leaked)
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from clients.http import NoRouteFound, UpstreamError, WeatherDataError
from domain.enums import RiskLevel, WeatherDriver
from domain.models import (
    Checkpoint,
    HeatmapPoint,
    HeatmapResult,
    LatLng,
    Place,
    RiskAssessment,
    RouteGeometry,
    RouteSummary,
    WeatherSample,
)
from domain.ranking import RankedRouteItem, RouteRankingResult
from planner.cache import clear
from planner.trip_planner import CheckpointDetail, PlanResult, RouteDetail


@pytest.fixture(autouse=True)
def clean_cache():
    """Clear cache before and after each test."""
    clear()
    yield
    clear()


@pytest.fixture
def api_client():
    """APIClient fixture for testing endpoints."""
    return APIClient()


def make_fake_plan_result(departure_utc: datetime) -> PlanResult:
    """Helper creating a valid synthetic PlanResult for happy path testing."""
    route_geom = RouteGeometry(
        route_id="route-1",
        points=(LatLng(41.8781, -87.6298), LatLng(39.7392, -104.9903)),
        distance_mi=1003.4,
        base_duration_s=52000.0,
    )
    cp = Checkpoint(
        index=0,
        mile=0.0,
        position=LatLng(41.8781, -87.6298),
        segment_miles=12.5,
        eta_utc=departure_utc,
        forecast_hour_utc=departure_utc,
    )
    wx = WeatherSample(wind_mph=12.3, wind_gust_mph=21.0, rain_in_hr=0.0, snow_in_hr=0.0)
    rk = RiskAssessment(
        level=RiskLevel.LOW,
        wind_level=RiskLevel.LOW,
        rain_level=RiskLevel.LOW,
        snow_level=RiskLevel.LOW,
        driver=WeatherDriver.WIND,
        load_rule=None,
    )
    summary = RouteSummary(
        distance_miles=1003.4,
        base_duration_s=52000.0,
        buffered_duration_s=57200.0,
        departure_utc=departure_utc,
        arrival_utc=departure_utc + timedelta(hours=15),
        miles_by_level={lvl: 0.0 for lvl in RiskLevel},
        avg_risk=1.0,
        max_level=RiskLevel.LOW,
    )
    route_detail = RouteDetail(
        route=route_geom,
        summary=summary,
        checkpoints=[CheckpointDetail(checkpoint=cp, weather=wx, risk=rk)],
        rank=1,
        is_recommended=True,
        label="Route A",
    )
    ranking_res = RouteRankingResult(
        recommended_route_id="route-1",
        status="OK",
        reasons=["Route A is the best route."],
        ranking=[RankedRouteItem(route_id="route-1", key=(0.0, 0.0, 0.0, 1.0, 953))],
    )
    hm_point = HeatmapPoint(
        lat=41.88,
        lng=-87.63,
        risk=[0] * 49,
        wind_mph=[12.3] * 49,
        rain_in_hr=[0.0] * 49,
        snow_in_hr=[0.0] * 49,
    )
    heatmap_res = HeatmapResult(
        start_utc=departure_utc,
        hours=49,
        truncated=False,
        points=[hm_point],
    )
    return PlanResult(
        request_id="test-req-id-1234",
        generated_at_utc=datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc),
        input_data={
            "origin": {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
            "destination": {"label": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
            "departure_utc": "2026-11-02T13:00:00Z",
            "load_weight_lb": 42000,
            "checkpoint_interval_miles": 25,
        },
        settings={"delay_buffer": 1.10, "heatmap_interval_miles": 25, "truck_tare_lb": 32000},
        routes=[route_detail],
        recommendation=ranking_res,
        heatmap=heatmap_res,
        notices=[],
    )


class TestHealthEndpoint:
    """Verify GET /api/v1/health (Section 15.1)."""

    def test_health_check_returns_ok_and_version(self, api_client):
        response = api_client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "version": "1.0.0"}


class TestGeocodeSuggestEndpoint:
    """Verify GET /api/v1/geocode/suggest (Section 15.2, D-22)."""

    def test_suggest_happy_path(self, api_client):
        mock_places = [Place(label="Chicago, IL, United States", lat=41.8781, lng=-87.6298)]
        with patch("api.views.suggest", return_value=mock_places):
            response = api_client.get("/api/v1/geocode/suggest?q=Chicago")
            assert response.status_code == 200
            data = response.json()
            assert "results" in data
            assert len(data["results"]) == 1
            assert data["results"][0]["label"] == "Chicago, IL, United States"
            assert data["results"][0]["lat"] == 41.8781
            assert data["results"][0]["lng"] == -87.6298

    def test_suggest_query_too_short_raises_validation_error(self, api_client):
        response = api_client.get("/api/v1/geocode/suggest?q=ab")
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "VALIDATION_ERROR"
        assert "q" in data["error"]["details"]


class TestPlanEndpointHappyPath:
    """Verify POST /api/v1/plan happy path shape (Section 15.3)."""

    def test_plan_endpoint_happy_path(self, api_client):
        now = datetime.now(timezone.utc)
        dep_time = (now + timedelta(days=1)).isoformat()
        payload = {
            "origin": {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
            "destination": {"label": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
            "departure_time": dep_time,
            "load_weight_lb": 42000,
            "checkpoint_interval_miles": 25,
        }

        fake_res = make_fake_plan_result(now + timedelta(days=1))
        with patch("api.views.plan_trip", return_value=fake_res):
            response = api_client.post("/api/v1/plan", payload, format="json")
            assert response.status_code == 200
            assert "X-Request-ID" in response.headers
            data = response.json()
            assert set(data.keys()) == {
                "request_id",
                "generated_at_utc",
                "input",
                "settings",
                "routes",
                "recommendation",
                "heatmap",
                "notices",
            }
            assert len(data["routes"]) == 1
            assert data["routes"][0]["id"] == "route-1"
            assert data["recommendation"]["status"] == "OK"


class TestPlanValidationErrors:
    """Verify per-field validation rules and boundary values (Section 15.3, D-09, D-10)."""

    def setup_method(self):
        self.now = datetime.now(timezone.utc)
        self.valid_dep = (self.now + timedelta(days=1)).isoformat()
        self.base_payload = {
            "origin": {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
            "destination": {"label": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
            "departure_time": self.valid_dep,
            "load_weight_lb": 42000,
            "checkpoint_interval_miles": 25,
        }

    def test_missing_origin(self, api_client):
        payload = dict(self.base_payload)
        del payload["origin"]
        res = api_client.post("/api/v1/plan", payload, format="json")
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"
        assert "origin" in res.json()["error"]["details"]

    def test_missing_destination(self, api_client):
        payload = dict(self.base_payload)
        del payload["destination"]
        res = api_client.post("/api/v1/plan", payload, format="json")
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"
        assert "destination" in res.json()["error"]["details"]

    def test_latitude_out_of_bounds(self, api_client):
        payload = dict(self.base_payload)
        payload["origin"] = {"label": "Invalid", "lat": 95.0, "lng": -87.0}
        res = api_client.post("/api/v1/plan", payload, format="json")
        assert res.status_code == 400
        assert "origin" in res.json()["error"]["details"]

    def test_longitude_out_of_bounds(self, api_client):
        payload = dict(self.base_payload)
        payload["destination"] = {"label": "Invalid", "lat": 40.0, "lng": -190.0}
        res = api_client.post("/api/v1/plan", payload, format="json")
        assert res.status_code == 400
        assert "destination" in res.json()["error"]["details"]

    def test_origin_destination_less_than_1_mile_apart(self, api_client):
        """Origin and destination under 1.0 mile apart triggers VALIDATION_ERROR (Section 15.3)."""
        payload = dict(self.base_payload)
        # 0.001 deg lat is ~0.069 miles (< 1 mi)
        payload["destination"] = {"label": "Too Close", "lat": 41.8791, "lng": -87.6298}
        res = api_client.post("/api/v1/plan", payload, format="json")
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"
        assert "destination" in res.json()["error"]["details"]

    def test_load_weight_boundaries(self, api_client):
        """Boundary values: load 1, 80000 are valid; 0, 80001 are invalid (D-09)."""
        fake_res = make_fake_plan_result(self.now + timedelta(days=1))
        with patch("api.views.plan_trip", return_value=fake_res):
            # 1: Valid lower boundary
            p1 = dict(self.base_payload, load_weight_lb=1)
            res1 = api_client.post("/api/v1/plan", p1, format="json")
            assert res1.status_code == 200

            # 80000: Valid upper boundary
            p80k = dict(self.base_payload, load_weight_lb=80000)
            res80k = api_client.post("/api/v1/plan", p80k, format="json")
            assert res80k.status_code == 200

        # 0: Below min
        p0 = dict(self.base_payload, load_weight_lb=0)
        res0 = api_client.post("/api/v1/plan", p0, format="json")
        assert res0.status_code == 400
        assert "load_weight_lb" in res0.json()["error"]["details"]

        # 80001: Above max
        p80001 = dict(self.base_payload, load_weight_lb=80001)
        res80001 = api_client.post("/api/v1/plan", p80001, format="json")
        assert res80001.status_code == 400
        assert "load_weight_lb" in res80001.json()["error"]["details"]

    def test_checkpoint_interval_boundaries(self, api_client):
        """Interval 20 is invalid; 10, 25, 50 are valid (D-01)."""
        fake_res = make_fake_plan_result(self.now + timedelta(days=1))
        with patch("api.views.plan_trip", return_value=fake_res):
            for valid_i in (10, 25, 50):
                p = dict(self.base_payload, checkpoint_interval_miles=valid_i)
                res = api_client.post("/api/v1/plan", p, format="json")
                assert res.status_code == 200

        # 20: Invalid interval
        p20 = dict(self.base_payload, checkpoint_interval_miles=20)
        res20 = api_client.post("/api/v1/plan", p20, format="json")
        assert res20.status_code == 400
        assert "checkpoint_interval_miles" in res20.json()["error"]["details"]

    def test_departure_in_past_beyond_grace_fails(self, api_client):
        """Departure > 60 minutes in past triggers VALIDATION_ERROR (D-10, Section 15.3)."""
        past_dep = (self.now - timedelta(minutes=75)).isoformat()
        payload = dict(self.base_payload, departure_time=past_dep)
        res = api_client.post("/api/v1/plan", payload, format="json")
        assert res.status_code == 400
        assert "departure_time" in res.json()["error"]["details"]

    def test_departure_in_past_within_grace_succeeds(self, api_client):
        """Departure within 60 minutes in the past is accepted (grace period)."""
        past_ok = (self.now - timedelta(minutes=20)).isoformat()
        payload = dict(self.base_payload, departure_time=past_ok)
        fake_res = make_fake_plan_result(self.now)
        with patch("api.views.plan_trip", return_value=fake_res):
            res = api_client.post("/api/v1/plan", payload, format="json")
            assert res.status_code == 200

    def test_departure_more_than_7_days_ahead_fails(self, api_client):
        """Departure > 7 days ahead triggers VALIDATION_ERROR (D-10, Section 15.3)."""
        far_dep = (self.now + timedelta(days=8)).isoformat()
        payload = dict(self.base_payload, departure_time=far_dep)
        res = api_client.post("/api/v1/plan", payload, format="json")
        assert res.status_code == 400
        assert "departure_time" in res.json()["error"]["details"]

    def test_departure_naive_datetime_fails(self, api_client):
        """Departure without timezone offset triggers VALIDATION_ERROR."""
        payload = dict(self.base_payload, departure_time="2026-11-02T13:00:00")
        res = api_client.post("/api/v1/plan", payload, format="json")
        assert res.status_code == 400
        assert "departure_time" in res.json()["error"]["details"]


class TestStandardizedErrorMappings:
    """Verify error envelope and status codes for each situation in Section 15.4."""

    def setup_method(self):
        now = datetime.now(timezone.utc)
        self.payload = {
            "origin": {"label": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
            "destination": {"label": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
            "departure_time": (now + timedelta(days=1)).isoformat(),
            "load_weight_lb": 42000,
            "checkpoint_interval_miles": 25,
        }

    def test_no_route_found_maps_to_422(self, api_client):
        """NoRouteFound maps to HTTP 422 with code NO_ROUTE_FOUND."""
        with patch("api.views.plan_trip", side_effect=NoRouteFound("No truck route found.")):
            res = api_client.post("/api/v1/plan", self.payload, format="json")
            assert res.status_code == 422
            data = res.json()
            assert data["error"]["code"] == "NO_ROUTE_FOUND"
            assert "No truck route found" in data["error"]["message"]

    def test_upstream_routing_error_maps_to_502(self, api_client):
        """HERE failure maps to HTTP 502 with code UPSTREAM_ROUTING_ERROR."""
        err = UpstreamError("here_routing", 502, "HERE API unavailable")
        with patch("api.views.plan_trip", side_effect=err):
            res = api_client.post("/api/v1/plan", self.payload, format="json")
            assert res.status_code == 502
            data = res.json()
            assert data["error"]["code"] == "UPSTREAM_ROUTING_ERROR"

    def test_upstream_weather_error_maps_to_502(self, api_client):
        """Open-Meteo failure maps to HTTP 502 with code UPSTREAM_WEATHER_ERROR."""
        err = WeatherDataError("Open-Meteo returned null values", status=502)
        with patch("api.views.plan_trip", side_effect=err):
            res = api_client.post("/api/v1/plan", self.payload, format="json")
            assert res.status_code == 502
            data = res.json()
            assert data["error"]["code"] == "UPSTREAM_WEATHER_ERROR"

    def test_rate_limited_upstream_maps_to_429(self, api_client):
        """Upstream 429 maps to HTTP 429 with code RATE_LIMITED."""
        err = UpstreamError("here_routing", 429, "Too many requests")
        with patch("api.views.plan_trip", side_effect=err):
            res = api_client.post("/api/v1/plan", self.payload, format="json")
            assert res.status_code == 429
            data = res.json()
            assert data["error"]["code"] == "RATE_LIMITED"

    def test_upstream_weather_429_maps_to_rate_limited_with_retry_after(self, api_client):
        """Weather upstream 429 maps to RATE_LIMITED with message and retry_after_s."""
        err = WeatherDataError("Rate limit exceeded", status=429, retry_after_s=12)
        with patch("api.views.plan_trip", side_effect=err):
            res = api_client.post("/api/v1/plan", self.payload, format="json")
            assert res.status_code == 429
            data = res.json()
            assert data["error"]["code"] == "RATE_LIMITED"
            expected_msg = "The weather service is busy. Please try again in a minute."
            assert data["error"]["message"] == expected_msg
            assert data["error"]["details"] == {"retry_after_s": 12}
            assert res.headers.get("Retry-After") == "12"

    def test_upstream_weather_429_maps_to_rate_limited_without_retry_after(self, api_client):
        """Weather upstream 429 without retry-after maps to RATE_LIMITED with empty details."""
        err = WeatherDataError("Rate limit exceeded", status=429, retry_after_s=None)
        with patch("api.views.plan_trip", side_effect=err):
            res = api_client.post("/api/v1/plan", self.payload, format="json")
            assert res.status_code == 429
            data = res.json()
            assert data["error"]["code"] == "RATE_LIMITED"
            expected_msg = "The weather service is busy. Please try again in a minute."
            assert data["error"]["message"] == expected_msg
            assert data["error"]["details"] == {}
            assert "Retry-After" not in res.headers

    def test_internal_error_maps_to_500_without_stack_trace(self, api_client):
        """Unexpected internal exceptions map to 500 INTERNAL_ERROR without leaking traces."""
        with patch("api.views.plan_trip", side_effect=RuntimeError("Secret database crash")):
            res = api_client.post("/api/v1/plan", self.payload, format="json")
            assert res.status_code == 500
            data = res.json()
            assert data["error"]["code"] == "INTERNAL_ERROR"
            # Traceback must not be leaked
            assert "Secret database crash" not in data["error"]["message"]
            assert "Traceback" not in str(data)
