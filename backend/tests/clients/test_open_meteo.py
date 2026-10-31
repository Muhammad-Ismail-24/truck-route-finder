"""Tests for backend/clients/open_meteo.py.

Covers:
  - fetch_hourly(points, start_date, end_date) -> dict[GridKey, HourlySeries] (Section 11.4)
  - Multi-location list response parsing with fixture open_meteo_batch_sample.json
  - Single-location object response parsing
  - Calculation: rain_in_hr = rain + showers, snow_in_hr = snowfall
  - Outgoing query parameters: latitude, longitude, hourly, units, timezone=GMT, dates
  - Chunking over 50 points into multiple requests
  - Deduplication of points mapping to the same GridKey
  - Null value detection raising WeatherDataError (D-21)
  - Failing chunk that succeeds on retry (transient 5xx / timeout)
  - Failing chunk that fails twice raising WeatherDataError
  - Start/end date validations and formats (date, datetime, string)
  - Empty points handling without HTTP requests
"""

import copy
import json
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import pytest

from clients.http import UpstreamError, create_client
from clients.open_meteo import (
    ATTRIBUTION,
    CHUNK_SIZE,
    GridKey,
    WeatherDataError,
    fetch_hourly,
)
from domain.models import HourlySeries, LatLng

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
SAMPLE_BATCH_PATH = FIXTURES_DIR / "open_meteo_batch_sample.json"


class TestOpenMeteoClient:
    """Verify Open-Meteo hourly forecast client parsing, chunking, retry, and errors."""

    def setup_method(self):
        with open(SAMPLE_BATCH_PATH, encoding="utf-8") as f:
            self.fixture_data = json.load(f)
        self.chicago_key: GridKey = (41.88, -87.63)
        self.denver_key: GridKey = (39.74, -104.99)
        self.start_date = "2026-11-02"
        self.end_date = "2026-11-02"

    def test_fetch_hourly_multi_location_list_response(self):
        """Parses multi-location list response into dict[GridKey, HourlySeries]."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=self.fixture_data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        points = [
            LatLng(lat=41.8781, lng=-87.6298),
            LatLng(lat=39.7392, lng=-104.9903),
        ]
        result = fetch_hourly(
            points=points,
            start_date=self.start_date,
            end_date=self.end_date,
            client=client,
        )

        assert len(result) == 2
        assert self.chicago_key in result
        assert self.denver_key in result

        chicago_series = result[self.chicago_key]
        assert isinstance(chicago_series, HourlySeries)
        assert len(chicago_series.times_utc) == 24
        assert len(chicago_series.wind_mph) == 24
        assert len(chicago_series.wind_gust_mph) == 24
        assert len(chicago_series.rain_in_hr) == 24
        assert len(chicago_series.snow_in_hr) == 24

        # Verify UTC timezone on parsed datetimes
        t0 = chicago_series.times_utc[0]
        assert t0.tzinfo == timezone.utc
        assert t0.year == 2026
        assert t0.month == 11
        assert t0.day == 2
        assert t0.hour == 0

        # Verify rain_in_hr = rain + showers
        raw_hourly_0 = self.fixture_data[0]["hourly"]
        expected_rain_0 = float(raw_hourly_0["rain"][0]) + float(raw_hourly_0["showers"][0])
        assert chicago_series.rain_in_hr[0] == pytest.approx(expected_rain_0)
        assert chicago_series.snow_in_hr[0] == pytest.approx(float(raw_hourly_0["snowfall"][0]))
        assert chicago_series.wind_mph[0] == pytest.approx(float(raw_hourly_0["wind_speed_10m"][0]))
        assert chicago_series.wind_gust_mph[0] == pytest.approx(
            float(raw_hourly_0["wind_gusts_10m"][0])
        )

    def test_fetch_hourly_single_location_object_response(self):
        """Handles single-location response returned as a JSON object (dict)."""
        single_obj = self.fixture_data[0]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=single_obj)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        result = fetch_hourly(
            points=[self.chicago_key],
            start_date=self.start_date,
            end_date=self.end_date,
            client=client,
        )

        assert len(result) == 1
        assert self.chicago_key in result
        series = result[self.chicago_key]
        assert isinstance(series, HourlySeries)
        assert len(series.times_utc) == 24

    def test_outgoing_query_parameters(self):
        """Verifies Open-Meteo URL and exact query parameters match spec (Section 11.4)."""
        recorded_request: httpx.Request | None = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal recorded_request
            recorded_request = request
            return httpx.Response(200, json=self.fixture_data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        fetch_hourly(
            points=[self.chicago_key, self.denver_key],
            start_date="2026-11-02",
            end_date="2026-11-03",
            client=client,
        )

        assert recorded_request is not None
        assert "api.open-meteo.com/v1/forecast" in str(recorded_request.url)
        params = recorded_request.url.params
        assert params["latitude"] == "41.88,39.74"
        assert params["longitude"] == "-87.63,-104.99"
        assert params["hourly"] == "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall"
        assert params["wind_speed_unit"] == "mph"
        assert params["precipitation_unit"] == "inch"
        assert params["timezone"] == "GMT"
        assert params["start_date"] == "2026-11-02"
        assert params["end_date"] == "2026-11-03"

    def test_chunking_over_50_points(self):
        """Locations > 50 are chunked into requests of 50 locations max (parallel)."""
        # Create 65 unique grid points
        test_points = [(round(30.0 + i * 0.1, 2), round(-90.0 - i * 0.1, 2)) for i in range(65)]
        requests_made: list[httpx.Request] = []

        def make_dummy_item(lat: float, lng: float) -> dict:
            return {
                "latitude": lat,
                "longitude": lng,
                "hourly": {
                    "time": ["2026-11-02T00:00", "2026-11-02T01:00"],
                    "wind_speed_10m": [10.0, 11.0],
                    "wind_gusts_10m": [15.0, 16.0],
                    "rain": [0.0, 0.0],
                    "showers": [0.0, 0.0],
                    "snowfall": [0.0, 0.0],
                },
            }

        def handler(request: httpx.Request) -> httpx.Response:
            requests_made.append(request)
            lats = [float(x) for x in request.url.params["latitude"].split(",")]
            lngs = [float(x) for x in request.url.params["longitude"].split(",")]
            items = [make_dummy_item(lat, lng) for lat, lng in zip(lats, lngs, strict=True)]
            # If 1 item, return object, else list
            response_json = items[0] if len(items) == 1 else items
            return httpx.Response(200, json=response_json)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        result = fetch_hourly(
            points=test_points,
            start_date=self.start_date,
            end_date=self.end_date,
            client=client,
        )

        assert len(requests_made) == 2
        chunk_1_lats = requests_made[0].url.params["latitude"].split(",")
        chunk_2_lats = requests_made[1].url.params["latitude"].split(",")
        assert len(chunk_1_lats) == 50
        assert len(chunk_2_lats) == 15
        assert len(result) == 65
        for pt in test_points:
            assert pt in result

    def test_deduplicates_points_before_fetching(self):
        """Points resolving to the same 2-decimal GridKey are deduplicated."""
        points = [
            LatLng(lat=41.8781, lng=-87.6298),
            LatLng(lat=41.8812, lng=-87.6321),  # rounds to (41.88, -87.63)
            (41.88, -87.63),
        ]
        requested_lats: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requested_lats.extend(request.url.params["latitude"].split(","))
            return httpx.Response(200, json=self.fixture_data[0])

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        result = fetch_hourly(
            points=points,
            start_date=self.start_date,
            end_date=self.end_date,
            client=client,
        )

        assert requested_lats == ["41.88"]
        assert len(result) == 1
        assert self.chicago_key in result

    def test_null_wind_raises_weather_data_error(self):
        """Any null in wind_speed_10m raises WeatherDataError (D-21)."""
        data = copy.deepcopy(self.fixture_data)
        data[0]["hourly"]["wind_speed_10m"][2] = None

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(WeatherDataError) as exc_info:
            fetch_hourly(
                points=[self.chicago_key, self.denver_key],
                start_date=self.start_date,
                end_date=self.end_date,
                client=client,
            )
        assert "Null weather value" in str(exc_info.value)
        assert issubclass(WeatherDataError, UpstreamError)

    def test_null_rain_raises_weather_data_error(self):
        """Any null in rain raises WeatherDataError (D-21)."""
        data = copy.deepcopy(self.fixture_data)
        data[0]["hourly"]["rain"][5] = None

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(WeatherDataError):
            fetch_hourly(
                points=[self.chicago_key],
                start_date=self.start_date,
                end_date=self.end_date,
                client=client,
            )

    def test_null_showers_raises_weather_data_error(self):
        """Any null in showers raises WeatherDataError (D-21)."""
        data = copy.deepcopy(self.fixture_data)
        data[0]["hourly"]["showers"][1] = None

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(WeatherDataError):
            fetch_hourly(
                points=[self.chicago_key],
                start_date=self.start_date,
                end_date=self.end_date,
                client=client,
            )

    def test_null_snowfall_raises_weather_data_error(self):
        """Any null in snowfall raises WeatherDataError (D-21)."""
        data = copy.deepcopy(self.fixture_data)
        data[0]["hourly"]["snowfall"][0] = None

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(WeatherDataError):
            fetch_hourly(
                points=[self.chicago_key],
                start_date=self.start_date,
                end_date=self.end_date,
                client=client,
            )

    def test_null_wind_gusts_raises_weather_data_error(self):
        """Any null in wind_gusts_10m raises WeatherDataError (D-21)."""
        data = copy.deepcopy(self.fixture_data)
        data[0]["hourly"]["wind_gusts_10m"][4] = None

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=data)

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(WeatherDataError):
            fetch_hourly(
                points=[self.chicago_key],
                start_date=self.start_date,
                end_date=self.end_date,
                client=client,
            )

    def test_retry_on_chunk_failure_succeeds_second_attempt(self):
        """A failing chunk (500) retries and succeeds if second attempt returns 200."""
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                return httpx.Response(500, text="Internal Server Error")
            return httpx.Response(200, json=self.fixture_data[0])

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        result = fetch_hourly(
            points=[self.chicago_key],
            start_date=self.start_date,
            end_date=self.end_date,
            client=client,
        )

        assert calls == 2
        assert len(result) == 1
        assert self.chicago_key in result

    def test_failing_chunk_fails_twice_raises_weather_data_error(self):
        """A failing chunk that fails twice raises WeatherDataError (status 502 / D-21)."""
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(502, text="Bad Gateway")

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(WeatherDataError) as exc_info:
            fetch_hourly(
                points=[self.chicago_key],
                start_date=self.start_date,
                end_date=self.end_date,
                client=client,
            )

        assert calls == 2
        assert exc_info.value.service == "open_meteo"
        assert exc_info.value.status == 502

    def test_timeout_retry_and_failure(self):
        """Retries on TimeoutException, raises WeatherDataError on persistent timeout."""
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            raise httpx.ReadTimeout("Read timed out")

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        with pytest.raises(WeatherDataError):
            fetch_hourly(
                points=[self.chicago_key],
                start_date=self.start_date,
                end_date=self.end_date,
                client=client,
            )
        assert calls == 2

    def test_empty_points_returns_empty_dict_without_requests(self):
        """Passing empty points returns {} without making any HTTP requests."""
        made_call = False

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal made_call
            made_call = True
            return httpx.Response(200, json={})

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        assert fetch_hourly([], self.start_date, self.end_date, client=client) == {}
        assert made_call is False

    def test_date_types_accepted(self):
        """Accepts date objects, datetime objects, and strings."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=self.fixture_data[0])

        client = create_client(transport=httpx.MockTransport(handler), backoff_s=0.0)
        # date object
        res1 = fetch_hourly(
            [self.chicago_key],
            date(2026, 11, 2),
            date(2026, 11, 2),
            client=client,
        )
        assert len(res1) == 1

        # datetime object
        res2 = fetch_hourly(
            [self.chicago_key],
            datetime(2026, 11, 2, 8, 0),
            datetime(2026, 11, 2, 20, 0),
            client=client,
        )
        assert len(res2) == 1

    def test_start_date_after_end_date_raises_value_error(self):
        """start_date > end_date raises ValueError."""
        with pytest.raises(ValueError, match="cannot be after end_date"):
            fetch_hourly([self.chicago_key], "2026-11-05", "2026-11-02")

    def test_constants_and_attribution(self):
        """Verifies CHUNK_SIZE=50 and attribution string."""
        assert CHUNK_SIZE == 50
        assert ATTRIBUTION == "Weather data by Open-Meteo.com"
