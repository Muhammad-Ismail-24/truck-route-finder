"""Tests for backend/clients/http.py and backend/clients/here_routing.py.

Covers:
  - Shared httpx client factory with timeouts (10s total, 5s connect) (Section 11.1)
  - Custom User-Agent: spotter-truck-routing/1.0
  - 1 retry on timeout, 5xx, 429 with backoff (Section 11.1)
  - Typed errors: UpstreamError(service, status, detail), NoRouteFound
  - fetch_truck_routes with HERE Routing API v8 (Section 11.2, D-12, D-23, D-24)
  - truck mode, alternatives=2, grossWeight from load + TRUCK_TARE_LB capped at 80,000 lb
  - Section polyline concatenation, join point deduplication, consecutive duplicate dropping
  - Mapping to route-1..route-3 in HERE order
  - Zero routes raises NoRouteFound
  - No network in tests (httpx.MockTransport with fixture)
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from clients.here_routing import fetch_truck_routes
from clients.http import NoRouteFound, UpstreamError, create_client
from domain.models import LatLng, RouteGeometry

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
SAMPLE_ROUTES_PATH = FIXTURES_DIR / "here_routes_sample.json"


# ---------------------------------------------------------------------------
# 11.1 http.py tests
# ---------------------------------------------------------------------------


class TestHttpClientFactory:
    """Verify shared httpx client factory, headers, timeouts, and retry behavior."""

    def test_client_defaults(self):
        """Timeout must be 10s total (5s connect); User-Agent must be spotter-truck-routing/1.0."""
        client = create_client()
        assert client.headers["User-Agent"] == "spotter-truck-routing/1.0"
        assert client.timeout.read == 10.0
        assert client.timeout.connect == 5.0

    def test_retry_on_5xx_success_second_attempt(self):
        """Retries once on 5xx status codes and succeeds if second attempt returns 200."""
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                return httpx.Response(502, text="Bad Gateway")
            return httpx.Response(200, json={"status": "ok"})

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        resp = client.get("https://example.com/api")
        assert resp.status_code == 200
        assert calls == 2

    def test_retry_on_429_rate_limit(self):
        """Retries once on 429 Too Many Requests."""
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                return httpx.Response(429, text="Rate limit exceeded")
            return httpx.Response(200, json={"status": "ok"})

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        resp = client.get("https://example.com/api")
        assert resp.status_code == 200
        assert calls == 2

    def test_retry_on_timeout_exception(self):
        """Retries once on httpx.TimeoutException."""
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise httpx.ReadTimeout("Read timed out")
            return httpx.Response(200, json={"status": "ok"})

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        resp = client.get("https://example.com/api")
        assert resp.status_code == 200
        assert calls == 2

    def test_no_retry_on_4xx_client_error(self):
        """4xx errors (except 429) must not be retried."""
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(404, text="Not Found")

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        resp = client.get("https://example.com/api")
        assert resp.status_code == 404
        assert calls == 1

    def test_max_one_retry_on_persistent_5xx(self):
        """If 5xx persists, it only retries once (total 2 calls)."""
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(500, text="Internal Server Error")

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        resp = client.get("https://example.com/api")
        assert resp.status_code == 500
        assert calls == 2

    def test_typed_errors_definition(self):
        """UpstreamError contains service, status, and detail."""
        err = UpstreamError("here_routing", 502, "Bad Gateway")
        assert err.service == "here_routing"
        assert err.status == 502
        assert "502" in str(err)
        assert issubclass(NoRouteFound, Exception)
        from clients.http import WeatherDataError

        assert issubclass(WeatherDataError, UpstreamError)


# ---------------------------------------------------------------------------
# 11.2 here_routing.py tests
# ---------------------------------------------------------------------------


class TestHereRoutingClient:
    """Verify HERE Routing API v8 client parsing, parameters, weight capping, and errors."""

    def setup_method(self):
        with open(SAMPLE_ROUTES_PATH, encoding="utf-8") as f:
            self.fixture_data = json.load(f)
        self.departure = datetime(2026, 11, 2, 13, 0, 0, tzinfo=timezone.utc)
        self.origin = LatLng(lat=41.8781, lng=-87.6298)
        self.destination = LatLng(lat=39.7392, lng=-104.9903)

    def test_fetch_truck_routes_happy_path(self):
        """Parses sample fixture returning RouteGeometry with correct identifiers and units."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=self.fixture_data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        routes = fetch_truck_routes(
            origin=self.origin,
            destination=self.destination,
            departure_utc=self.departure,
            load_weight_lb=42_000,
            client=client,
            api_key="test-api-key",
        )

        assert len(routes) == 3
        assert [r.route_id for r in routes] == ["route-1", "route-2", "route-3"]

        r1 = routes[0]
        assert isinstance(r1, RouteGeometry)
        # Section 1 length (500k) + Section 2 length (1,114,810m) = 1,614,810m -> ~1003.4 miles
        assert pytest.approx(r1.distance_mi, rel=1e-3) == 1003.396
        # Duration: 18000 + 34000 = 52000s
        assert r1.base_duration_s == 52000.0

        # Section 1 has 3 points, Section 2 has 4 points with 1 duplicate join point
        # Expected points: 3 + 4 - 1 = 6 unique points
        assert len(r1.points) == 6
        assert r1.points[0] == LatLng(lat=41.8781, lng=-87.6298)
        assert r1.points[-1] == LatLng(lat=39.7392, lng=-104.9903)

    def test_request_parameters_match_specification(self):
        """Verifies outgoing query parameters: truck mode, coordinates, alternatives, weight."""
        recorded_request: httpx.Request | None = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal recorded_request
            recorded_request = request
            return httpx.Response(200, json=self.fixture_data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        fetch_truck_routes(
            origin=self.origin,
            destination=self.destination,
            departure_utc=self.departure,
            load_weight_lb=42_000,
            client=client,
            api_key="my-here-key",
        )

        assert recorded_request is not None
        params = recorded_request.url.params
        assert params["transportMode"] == "truck"
        assert params["origin"] == "41.8781,-87.6298"
        assert params["destination"] == "39.7392,-104.9903"
        assert params["departureTime"] == "2026-11-02T13:00:00Z"
        assert params["alternatives"] == "2"
        assert params["return"] == "polyline,summary"
        assert params.get("apiKey") == "my-here-key" or params.get("apikey") == "my-here-key"

        # D-24: (42,000 + 32,000) * 0.45359237 = 74,000 * 0.45359237 = 33565.83 -> 33566 kg
        weight_param = params.get("vehicle[grossWeight]") or params.get("truck[grossWeight]")
        assert weight_param == "33566"

    def test_gross_weight_capped_at_80000_lb(self):
        """D-24: Total gross weight capped at 80,000 lb (36,287 kg)."""
        recorded_request: httpx.Request | None = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal recorded_request
            recorded_request = request
            return httpx.Response(200, json=self.fixture_data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        # 60,000 load + 32,000 tare = 92,000 lb -> capped at 80,000 lb
        # 80,000 * 0.45359237 = 36287.38 -> 36287 kg
        fetch_truck_routes(
            origin=self.origin,
            destination=self.destination,
            departure_utc=self.departure,
            load_weight_lb=60_000,
            client=client,
            api_key="key",
        )

        assert recorded_request is not None
        params = recorded_request.url.params
        weight_param = params.get("vehicle[grossWeight]") or params.get("truck[grossWeight]")
        assert weight_param == "36287"

    def test_zero_routes_returned_raises_no_route_found(self):
        """Section 11.2: Zero routes returned -> raise NoRouteFound."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"routes": []})

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(NoRouteFound):
            fetch_truck_routes(
                origin=self.origin,
                destination=self.destination,
                departure_utc=self.departure,
                load_weight_lb=20_000,
                client=client,
                api_key="key",
            )

    def test_non_200_response_raises_upstream_error(self):
        """Section 11.1 / 11.2: Upstream HTTP error raises UpstreamError with status and service."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, text="Unauthorized: Invalid API key")

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(UpstreamError) as exc_info:
            fetch_truck_routes(
                origin=self.origin,
                destination=self.destination,
                departure_utc=self.departure,
                load_weight_lb=20_000,
                client=client,
                api_key="bad-key",
            )
        assert exc_info.value.service == "here_routing"
        assert exc_info.value.status == 401
        assert "Unauthorized" in exc_info.value.detail

    def test_caps_routes_at_3_if_more_returned(self):
        """Section 18: If HERE returns >3 routes, take first 3."""
        four_routes = dict(self.fixture_data)
        # Duplicate route 3 to make 4 routes
        extra_route = self.fixture_data["routes"][-1]
        four_routes["routes"] = list(self.fixture_data["routes"]) + [extra_route]
        assert len(four_routes["routes"]) == 4

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=four_routes)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        routes = fetch_truck_routes(
            origin=self.origin,
            destination=self.destination,
            departure_utc=self.departure,
            load_weight_lb=20_000,
            client=client,
            api_key="key",
        )
        assert len(routes) == 3
        assert [r.route_id for r in routes] == ["route-1", "route-2", "route-3"]
