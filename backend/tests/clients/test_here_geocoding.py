"""Tests for backend/clients/here_geocoding.py.

Covers:
  - suggest(query) -> list[Place] (Section 11.3, D-22)
  - Endpoint: https://autosuggest.search.hereapi.com/v1/autosuggest
  - Query parameters: q, in=bbox:-180,-90,180,90, limit=5, apiKey (worldwide, no US-only at/in)
  - Max 5 results returned
  - Filtering items lacking position coordinates
  - Fallback to title when address.label is missing
  - Empty query handling without HTTP requests
  - Non-200 HTTP status raises UpstreamError
  - No network in tests (httpx.MockTransport with fixture)
"""

import json
from pathlib import Path

import httpx
import pytest

from clients.here_geocoding import suggest
from clients.http import UpstreamError, create_client
from domain.models import Place

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
SAMPLE_GEOCODE_PATH = FIXTURES_DIR / "here_geocode_sample.json"


class TestHereGeocodingClient:
    """Verify HERE Geocoding & Search autosuggest client."""

    def setup_method(self):
        with open(SAMPLE_GEOCODE_PATH, encoding="utf-8") as f:
            self.fixture_data = json.load(f)

    def test_suggest_happy_path(self):
        """Parses sample fixture returning list of Place objects with label, lat, and lng."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=self.fixture_data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        places = suggest(query="Chicago", client=client, api_key="test-api-key")

        assert len(places) == 5
        assert all(isinstance(p, Place) for p in places)

        p1 = places[0]
        assert p1.label == "Chicago, IL, United States"
        assert p1.lat == 41.8781
        assert p1.lng == -87.6298

    def test_suggest_query_parameters(self):
        """Verifies outgoing query parameters: endpoint, q, in=bbox, limit, apiKey."""
        recorded_request: httpx.Request | None = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal recorded_request
            recorded_request = request
            return httpx.Response(200, json=self.fixture_data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        suggest(query="Chicago", client=client, api_key="my-key", limit=5)

        assert recorded_request is not None
        assert "autosuggest" in str(recorded_request.url)
        params = recorded_request.url.params
        assert params["q"] == "Chicago"
        assert "at" not in params
        assert params["in"] == "bbox:-180,-90,180,90"
        assert params["limit"] == "5"
        assert params.get("apiKey") == "my-key" or params.get("apikey") == "my-key"

    def test_suggest_skips_items_without_position(self):
        """Items lacking position (e.g. categoryQuery) are filtered out."""

        # 6 items in fixture, but only 5 have position
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=self.fixture_data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        places = suggest(query="Chicago", client=client, api_key="my-key", limit=10)

        # Only 5 items had valid position
        assert len(places) == 5
        assert all(hasattr(p, "lat") and hasattr(p, "lng") for p in places)

    def test_suggest_fallback_to_title_when_no_address_label(self):
        """Uses item.title when address.label is not present."""
        data = {
            "items": [
                {
                    "title": "Denver Landmark, CO",
                    "position": {"lat": 39.7392, "lng": -104.9903},
                }
            ]
        }

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        places = suggest(query="Denver", client=client, api_key="key")

        assert len(places) == 1
        assert places[0].label == "Denver Landmark, CO"
        assert places[0].lat == 39.7392
        assert places[0].lng == -104.9903

    def test_empty_or_whitespace_query_returns_empty_without_request(self):
        """Empty or whitespace-only query returns [] without making an HTTP request."""
        made_request = False

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal made_request
            made_request = True
            return httpx.Response(200, json={"items": []})

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        assert suggest(query="", client=client) == []
        assert suggest(query="   ", client=client) == []
        assert made_request is False

    def test_empty_items_returns_empty_list(self):
        """When HERE returns zero items, suggest returns empty list."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"items": []})

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        places = suggest(query="Nowhere", client=client, api_key="key")
        assert places == []

    def test_non_200_response_raises_upstream_error(self):
        """HTTP error raises UpstreamError('here_geocoding', status, detail)."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(403, text="Forbidden: Quota exceeded")

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(UpstreamError) as exc_info:
            suggest(query="Chicago", client=client, api_key="key")

        assert exc_info.value.service == "here_geocoding"
        assert exc_info.value.status == 403
        assert "Forbidden" in exc_info.value.detail
