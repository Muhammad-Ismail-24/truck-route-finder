"""Tests for backend/planner/trip_planner.py and backend/planner/presenters.py.

Covers:
  - plan_trip end-to-end with fake injected clients (Sections 5, 12.1)
  - 3-route plan with ranking and recommendation
  - 1-route plan emitting FEWER_THAN_3_ROUTES notice
  - Route shorter than interval producing exactly 2 checkpoints
  - Heavy vs light load altering risk evaluation and load rules (Section 9.3)
  - Long-range departure (> 5 days) emitting LONG_RANGE_FORECAST notice
  - Upstream weather failure propagating as typed WeatherDataError (D-21)
  - Routes ordered by rank (best first) while display labels stay A/B/C by HERE order
  - Presenter output JSON schema and contract verification matching Section 15.3
"""

from datetime import datetime, timedelta, timezone

import pytest

from clients.http import WeatherDataError
from domain.constants import HEATMAP_HOURS
from domain.enums import RiskLevel
from domain.geometry import cumulative_miles
from domain.models import HourlySeries, LatLng, Place, RouteGeometry
from planner.cache import clear
from planner.presenters import present_plan
from planner.trip_planner import PlanRequest, plan_trip


@pytest.fixture(autouse=True)
def clean_cache():
    """Clear cache before and after every test."""
    clear()
    yield
    clear()


def make_route(
    route_id: str,
    distance_mi: float | None = None,
    base_duration_s: float = 7200.0,
    start_lat: float = 41.88,
    end_lat: float = 40.0,
    lng: float = -87.63,
) -> RouteGeometry:
    """Helper to generate synthetic RouteGeometry."""
    pts = (
        LatLng(lat=start_lat, lng=lng),
        LatLng(lat=(start_lat + end_lat) / 2.0, lng=lng),
        LatLng(lat=end_lat, lng=lng),
    )
    actual_mi = cumulative_miles(pts)[-1]
    return RouteGeometry(
        route_id=route_id,
        points=pts,
        distance_mi=distance_mi if distance_mi is not None else actual_mi,
        base_duration_s=base_duration_s,
    )


def make_weather_series(
    start_time: datetime,
    wind_mph: float = 10.0,
    gust_mph: float = 15.0,
    rain_in_hr: float = 0.0,
    snow_in_hr: float = 0.0,
    hours: int = 72,
) -> HourlySeries:
    """Helper to generate synthetic HourlySeries covering hours."""
    times = [start_time + timedelta(hours=i) for i in range(hours)]
    return HourlySeries(
        times_utc=times,
        wind_mph=[wind_mph] * hours,
        wind_gust_mph=[gust_mph] * hours,
        rain_in_hr=[rain_in_hr] * hours,
        snow_in_hr=[snow_in_hr] * hours,
    )


class TestTripPlanner:
    """Verify trip planner orchestration, dependency injection, and business rules."""

    def setup_method(self):
        self.origin = Place(label="Chicago, IL", lat=41.8781, lng=-87.6298)
        self.dest = Place(label="Denver, CO", lat=39.7392, lng=-104.9903)
        self.now_utc = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        self.departure_utc = datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc)

    def test_normal_3_route_plan(self):
        """Plan with 3 routes evaluates checkpoints, summarizes, ranks, and builds heatmap."""
        r1 = make_route("route-1", distance_mi=100.0, start_lat=41.88, end_lat=40.5)
        r2 = make_route("route-2", distance_mi=110.0, start_lat=41.88, end_lat=40.4)
        r3 = make_route("route-3", distance_mi=120.0, start_lat=41.88, end_lat=40.3)

        def fake_routing(*args, **kwargs):
            return [r1, r2, r3]

        def fake_weather(points, *args, **kwargs):
            return {
                pt: make_weather_series(self.departure_utc, wind_mph=12.0)
                for pt in points
            }

        req = PlanRequest(
            origin=self.origin,
            destination=self.dest,
            departure_time=self.departure_utc,
            load_weight_lb=42_000,
            checkpoint_interval_miles=25.0,
        )

        plan = plan_trip(
            request=req,
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=self.now_utc,
        )

        assert len(plan.routes) == 3
        assert plan.recommendation.status == "OK"
        assert plan.recommendation.recommended_route_id in ["route-1", "route-2", "route-3"]
        assert len(plan.recommendation.ranking) == 3
        assert plan.heatmap.hours == HEATMAP_HOURS
        assert plan.heatmap.truncated is False

    def test_one_route_plan_emits_fewer_than_3_routes_notice(self):
        """When routing returns 1 route, notice FEWER_THAN_3_ROUTES is emitted (D-23)."""
        r1 = make_route("route-1", distance_mi=50.0)

        def fake_routing(*args, **kwargs):
            return [r1]

        def fake_weather(points, *args, **kwargs):
            return {pt: make_weather_series(self.departure_utc) for pt in points}

        req = PlanRequest(
            origin=self.origin,
            destination=self.dest,
            departure_time=self.departure_utc,
            load_weight_lb=20_000,
        )

        plan = plan_trip(
            request=req,
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=self.now_utc,
        )

        assert len(plan.routes) == 1
        notice_codes = [n["code"] for n in plan.notices]
        assert "FEWER_THAN_3_ROUTES" in notice_codes
        assert "Only 1 route(s) were found." in [n["message"] for n in plan.notices]
        assert plan.recommendation.reasons == ["Only one route was available."]

    def test_route_shorter_than_interval_produces_two_checkpoints(self):
        """Route shorter than interval (< 25 mi) produces exactly two checkpoints."""
        short_route = make_route(
            "route-1",
            start_lat=41.88,
            end_lat=41.70,
        )

        def fake_routing(*args, **kwargs):
            return [short_route]

        def fake_weather(points, *args, **kwargs):
            return {pt: make_weather_series(self.departure_utc) for pt in points}

        req = PlanRequest(
            origin=self.origin,
            destination=self.dest,
            departure_time=self.departure_utc,
            load_weight_lb=30_000,
            checkpoint_interval_miles=25.0,
        )

        plan = plan_trip(
            request=req,
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=self.now_utc,
        )

        r_detail = plan.routes[0]
        # Exactly start and end checkpoints
        assert len(r_detail.checkpoints) == 2
        assert r_detail.checkpoints[0].checkpoint.mile == 0.0
        last_cp_mile = r_detail.checkpoints[-1].checkpoint.mile
        assert pytest.approx(last_cp_mile, rel=1e-3) == short_route.distance_mi

    def test_heavy_vs_light_load_changes_risk(self):
        """Wind 40 mph is HIGH for light load, but SEVERE for load > 40k lb (Section 9.3)."""
        route = make_route("route-1", distance_mi=50.0)

        def fake_routing(*args, **kwargs):
            return [route]

        # 40 mph sustained wind
        def fake_weather(points, *args, **kwargs):
            return {
                pt: make_weather_series(self.departure_utc, wind_mph=40.0)
                for pt in points
            }

        # 1. Light load (20,000 lb): Rule 3 does not apply; wind level is HIGH
        plan_light = plan_trip(
            request=PlanRequest(
                origin=self.origin,
                destination=self.dest,
                departure_time=self.departure_utc,
                load_weight_lb=20_000,
            ),
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=self.now_utc,
        )
        cp_light = plan_light.routes[0].checkpoints[0]
        assert cp_light.risk.level == RiskLevel.HIGH
        assert cp_light.risk.load_rule is None

        # 2. Heavy load (45,000 lb): Rule 3 triggers (35-44 mph and load > 40k -> SEVERE)
        plan_heavy = plan_trip(
            request=PlanRequest(
                origin=self.origin,
                destination=self.dest,
                departure_time=self.departure_utc,
                load_weight_lb=45_000,
            ),
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=self.now_utc,
        )
        cp_heavy = plan_heavy.routes[0].checkpoints[0]
        assert cp_heavy.risk.level == RiskLevel.SEVERE
        assert cp_heavy.risk.load_rule == "WIND_35_44_OVER_40K"

    def test_long_range_notice_emitted_when_departure_over_5_days(self):
        """Departure > 5 days ahead emits LONG_RANGE_FORECAST notice (D-10, Section 18)."""
        route = make_route("route-1", distance_mi=50.0)

        def fake_routing(*args, **kwargs):
            return [route]

        def fake_weather(points, *args, **kwargs):
            return {pt: make_weather_series(self.departure_utc) for pt in points}

        # 6 days ahead
        departure_far = self.now_utc + timedelta(days=6)
        plan_far = plan_trip(
            request=PlanRequest(
                origin=self.origin,
                destination=self.dest,
                departure_time=departure_far,
                load_weight_lb=30_000,
            ),
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=self.now_utc,
        )
        notice_codes_far = [n["code"] for n in plan_far.notices]
        assert "LONG_RANGE_FORECAST" in notice_codes_far

        # 2 days ahead -> no LONG_RANGE_FORECAST notice
        departure_near = self.now_utc + timedelta(days=2)
        plan_near = plan_trip(
            request=PlanRequest(
                origin=self.origin,
                destination=self.dest,
                departure_time=departure_near,
                load_weight_lb=30_000,
            ),
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=self.now_utc,
        )
        notice_codes_near = [n["code"] for n in plan_near.notices]
        assert "LONG_RANGE_FORECAST" not in notice_codes_near

    def test_weather_failure_propagates_typed_error(self):
        """Upstream weather failure propagates as WeatherDataError (D-21)."""
        r1 = make_route("route-1")

        def fake_routing(*args, **kwargs):
            return [r1]

        def failing_weather(*args, **kwargs):
            raise WeatherDataError("Open-Meteo gateway error", status=502)

        with pytest.raises(WeatherDataError) as exc_info:
            plan_trip(
                request=PlanRequest(
                    origin=self.origin,
                    destination=self.dest,
                    departure_time=self.departure_utc,
                    load_weight_lb=30_000,
                ),
                routing_client=fake_routing,
                weather_client=failing_weather,
                cache=None,
                now=self.now_utc,
            )
        assert exc_info.value.status == 502
        assert "Open-Meteo" in str(exc_info.value)

    def test_routes_ordered_by_rank_while_labels_stay_by_here_order(self):
        """routes is ordered by rank (best first) while labels stay A/B/C by HERE order (15.3)."""
        # Route 1: severe storm (50 mph wind -> SEVERE miles)
        r1 = make_route("route-1", distance_mi=100.0, start_lat=41.88, end_lat=40.5)
        # Route 2: clear weather (10 mph wind -> LOW miles)
        r2 = make_route("route-2", distance_mi=105.0, start_lat=41.88, end_lat=40.4)

        def fake_routing(*args, **kwargs):
            return [r1, r2]

        def fake_weather(points, *args, **kwargs):
            result = {}
            for pt in points:
                # Give route 1 high wind, route 2 low wind
                if pt[0] > 40.45:
                    result[pt] = make_weather_series(self.departure_utc, wind_mph=50.0)
                else:
                    result[pt] = make_weather_series(self.departure_utc, wind_mph=10.0)
            return result

        plan = plan_trip(
            request=PlanRequest(
                origin=self.origin,
                destination=self.dest,
                departure_time=self.departure_utc,
                load_weight_lb=30_000,
            ),
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=self.now_utc,
        )

        assert len(plan.routes) == 2
        best_route = plan.routes[0]
        runner_up = plan.routes[1]

        # Route 2 must be ranked #1 because it has fewer severe miles
        assert best_route.rank == 1
        assert best_route.is_recommended is True
        assert best_route.route.route_id == "route-2"
        # Display label MUST remain Route B (tied to HERE order, not rank)
        assert best_route.label == "Route B"

        # Route 1 is ranked #2 with label Route A
        assert runner_up.rank == 2
        assert runner_up.is_recommended is False
        assert runner_up.route.route_id == "route-1"
        assert runner_up.label == "Route A"


class TestPresentersContract:
    """Validate presenter output structure, keys, GeoJSON format, and rounding (Section 15.3)."""

    def test_present_plan_exact_contract_keys(self):
        """Verifies every top-level and nested key matches Section 15.3 schema."""
        origin = Place(label="Chicago, IL", lat=41.8781, lng=-87.6298)
        dest = Place(label="Denver, CO", lat=39.7392, lng=-104.9903)
        now_utc = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
        dep_utc = datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc)

        r1 = make_route("route-1", distance_mi=100.0)
        r2 = make_route("route-2", distance_mi=110.0)
        r3 = make_route("route-3", distance_mi=120.0)

        def fake_routing(*args, **kwargs):
            return [r1, r2, r3]

        def fake_weather(points, *args, **kwargs):
            return {pt: make_weather_series(dep_utc, wind_mph=15.0) for pt in points}

        req = PlanRequest(
            origin=origin,
            destination=dest,
            departure_time=dep_utc,
            load_weight_lb=42_000,
            checkpoint_interval_miles=25.0,
        )

        plan = plan_trip(
            request=req,
            routing_client=fake_routing,
            weather_client=fake_weather,
            cache=None,
            now=now_utc,
        )

        presented = present_plan(plan)

        # 1. Top-level keys
        assert set(presented.keys()) == {
            "request_id",
            "generated_at_utc",
            "input",
            "settings",
            "routes",
            "recommendation",
            "heatmap",
            "notices",
        }

        # 2. Input keys
        assert set(presented["input"].keys()) == {
            "origin",
            "destination",
            "departure_utc",
            "load_weight_lb",
            "checkpoint_interval_miles",
        }
        assert presented["input"]["origin"]["label"] == "Chicago, IL"
        assert presented["input"]["origin"]["lat"] == 41.8781
        assert presented["input"]["origin"]["lng"] == -87.6298

        # 3. Settings keys
        assert set(presented["settings"].keys()) == {
            "delay_buffer",
            "heatmap_interval_miles",
            "truck_tare_lb",
        }

        # 4. Routes keys and GeoJSON coordinates
        assert len(presented["routes"]) == 3
        r_out = presented["routes"][0]
        assert set(r_out.keys()) == {
            "id",
            "label",
            "rank",
            "is_recommended",
            "summary",
            "geometry",
            "checkpoints",
        }

        # Summary keys
        assert set(r_out["summary"].keys()) == {
            "distance_miles",
            "base_duration_s",
            "buffered_duration_s",
            "departure_utc",
            "arrival_utc",
            "avg_risk",
            "max_level",
            "miles_by_level",
        }
        # All 5 RiskLevels in miles_by_level
        assert set(r_out["summary"]["miles_by_level"].keys()) == {
            "LOW",
            "MODERATE",
            "HIGH",
            "SEVERE",
            "NO_TRAVEL",
        }

        # Geometry GeoJSON format [lng, lat]
        assert r_out["geometry"]["type"] == "LineString"
        coords = r_out["geometry"]["coordinates"]
        assert len(coords) >= 2
        # Verify first coordinate is [lng, lat]
        assert coords[0] == [-87.63, 41.88]

        # Checkpoints keys
        assert len(r_out["checkpoints"]) >= 2
        cp_out = r_out["checkpoints"][0]
        assert set(cp_out.keys()) == {
            "index",
            "mile",
            "lat",
            "lng",
            "segment_miles",
            "eta_utc",
            "forecast_hour_utc",
            "weather",
            "risk",
        }
        assert set(cp_out["weather"].keys()) == {
            "wind_mph",
            "wind_gust_mph",
            "rain_in_hr",
            "snow_in_hr",
        }
        assert set(cp_out["risk"].keys()) == {
            "level",
            "wind_level",
            "rain_level",
            "snow_level",
            "driver",
            "load_rule",
        }

        # 5. Recommendation keys
        assert set(presented["recommendation"].keys()) == {
            "route_id",
            "status",
            "reasons",
            "ranking",
        }
        rank_item = presented["recommendation"]["ranking"][0]
        assert set(rank_item.keys()) == {"route_id", "key"}
        assert len(rank_item["key"]) == 5

        # 6. Heatmap keys
        assert set(presented["heatmap"].keys()) == {
            "start_utc",
            "hours",
            "truncated",
            "points",
        }
        assert presented["heatmap"]["hours"] == 49
        hp_out = presented["heatmap"]["points"][0]
        assert set(hp_out.keys()) == {
            "lat",
            "lng",
            "risk",
            "wind_mph",
            "rain_in_hr",
            "snow_in_hr",
        }
        assert len(hp_out["risk"]) == 49
        assert len(hp_out["wind_mph"]) == 49
        assert len(hp_out["rain_in_hr"]) == 49
        assert len(hp_out["snow_in_hr"]) == 49
