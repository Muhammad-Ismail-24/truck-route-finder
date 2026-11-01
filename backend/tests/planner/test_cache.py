"""Tests for backend/planner/cache.py.

Covers:
  - Cache key builders and TTLs (Section 12.5):
    * wx:v1:{lat2}:{lng2}:{start_date}:{end_date} (TTL: 30 min)
    * route:v1:{sha1(origin,dest,departure_hour,load_bucket)} (TTL: 10 min)
    * suggest:v1:{lowercased query} (TTL: 24 h)
  - load_bucket = load_weight_lb // 5000 (same bucket -> same route key)
  - Cache operations (get, set, get_many, set_many, delete, clear)
  - fetch_weather_with_cache: cache hit avoids refetch, only fetches missing keys
"""

import hashlib
from datetime import date, datetime, timezone
from typing import Any

import pytest

from clients.http import WeatherDataError
from domain.models import HourlySeries, LatLng
from planner.cache import (
    ROUTE_CACHE_TTL_S,
    SUGGEST_CACHE_TTL_S,
    WEATHER_CACHE_TTL_S,
    build_route_cache_key,
    build_suggest_cache_key,
    build_weather_cache_key,
    cache_get,
    cache_set,
    clear,
    delete,
    fetch_weather_with_cache,
    get_many,
    set_cached_weather,
    set_many,
)


@pytest.fixture(autouse=True)
def clean_cache():
    """Clear cache before and after every test."""
    clear()
    yield
    clear()


class TestCacheKeyBuilders:
    """Verify cache key formatting, hashing, and TTL constants (Section 12.5)."""

    def test_ttl_constants(self):
        """TTLs must be: weather 30 min (1800s), route 10 min (600s), suggest 24h (86400s)."""
        assert WEATHER_CACHE_TTL_S == 1800
        assert ROUTE_CACHE_TTL_S == 600
        assert SUGGEST_CACHE_TTL_S == 86400

    def test_build_weather_cache_key_formatting(self):
        """wx:v1:{lat2}:{lng2}:{start_date}:{end_date} with 2-decimal rounded coords."""
        key1 = build_weather_cache_key(41.8781, -87.6298, "2026-11-02", "2026-11-04")
        assert key1 == "wx:v1:41.88:-87.63:2026-11-02:2026-11-04"

        # Date objects also accepted
        key2 = build_weather_cache_key(40.0, -90.0, date(2026, 11, 2), date(2026, 11, 3))
        assert key2 == "wx:v1:40.00:-90.00:2026-11-02:2026-11-03"

    def test_build_suggest_cache_key_lowercased(self):
        """suggest:v1:{lowercased query} strips whitespace and converts to lowercase."""
        key = build_suggest_cache_key("  Chicago, IL  ")
        assert key == "suggest:v1:chicago, il"

    def test_build_route_cache_key_sha1_and_load_bucket(self):
        """route:v1:{sha1(...)} uses load_bucket = load_weight_lb // 5000."""
        origin = LatLng(lat=41.8781, lng=-87.6298)
        dest = LatLng(lat=39.7392, lng=-104.9903)
        dep_dt = datetime(2026, 11, 2, 13, 30, tzinfo=timezone.utc)

        # 42,000 lb and 44,999 lb both yield bucket 8 (42000 // 5000 == 8)
        key_42k = build_route_cache_key(origin, dest, dep_dt, 42_000)
        key_44k = build_route_cache_key(origin, dest, dep_dt, 44_999)
        assert key_42k == key_44k
        assert key_42k.startswith("route:v1:")
        assert len(key_42k) == len("route:v1:") + 40  # 40 chars for SHA-1

        # 46,000 lb yields bucket 9 (46000 // 5000 == 9) -> different key
        key_46k = build_route_cache_key(origin, dest, dep_dt, 46_000)
        assert key_46k != key_42k

        # Verify exact SHA1 content
        expected_raw = "41.87810,-87.62980|39.73920,-104.99030|2026-11-02T13:00:00Z|8"
        expected_sha = hashlib.sha1(expected_raw.encode("utf-8")).hexdigest()
        assert key_42k == f"route:v1:{expected_sha}"


class TestCacheOperations:
    """Verify get, set, get_many, set_many, delete, and clear operations."""

    def test_basic_get_set_delete(self):
        """Set, get, and delete values from cache."""
        assert cache_get("test_k1") is None
        cache_set("test_k1", {"foo": "bar"}, timeout=60)
        assert cache_get("test_k1") == {"foo": "bar"}
        delete("test_k1")
        assert cache_get("test_k1") is None

    def test_get_many_and_set_many(self):
        """Set and retrieve multiple keys simultaneously."""
        set_many({"k1": 100, "k2": 200}, timeout=60)
        many = get_many(["k1", "k2", "k3"])
        assert many.get("k1") == 100
        assert many.get("k2") == 200
        assert many.get("k3") is None


class TestWeatherCacheAvoidsRefetch:
    """Verify cache hits avoid refetching from upstream (fake fetcher)."""

    def _make_dummy_series(self) -> HourlySeries:
        return HourlySeries(
            times_utc=[datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)],
            wind_mph=[10.0],
            wind_gust_mph=[15.0],
            rain_in_hr=[0.0],
            snow_in_hr=[0.0],
        )

    def test_cache_hit_avoids_refetch(self):
        """Repeated call with same grid keys uses cache and does not invoke fetcher."""
        calls_count = 0
        p1 = (41.88, -87.63)
        p2 = (39.74, -104.99)
        start = "2026-11-02"
        end = "2026-11-02"

        def fake_fetcher(
            keys: list[tuple[float, float]],
            s_date: str,
            e_date: str,
        ) -> dict[tuple[float, float], HourlySeries]:
            nonlocal calls_count
            calls_count += 1
            return {k: self._make_dummy_series() for k in keys}

        # First call: cache is empty, fetcher is invoked with both keys
        result1 = fetch_weather_with_cache([p1, p2], start, end, fake_fetcher)
        assert len(result1) == 2
        assert calls_count == 1
        assert p1 in result1
        assert p2 in result1

        # Second call: both keys are cached, fetcher is NOT called
        result2 = fetch_weather_with_cache([p1, p2], start, end, fake_fetcher)
        assert len(result2) == 2
        assert calls_count == 1  # Unchanged!

    def test_cache_partial_hit_only_fetches_missing(self):
        """When some keys are cached and some are missing, fetcher is called only for missing."""
        calls_count = 0
        requested_to_fetch: list[tuple[float, float]] = []
        p1 = (41.88, -87.63)
        p2 = (39.74, -104.99)
        p3 = (34.05, -118.24)
        start = "2026-11-02"
        end = "2026-11-02"

        def fake_fetcher(
            keys: list[tuple[float, float]],
            s_date: str,
            e_date: str,
        ) -> dict[tuple[float, float], HourlySeries]:
            nonlocal calls_count, requested_to_fetch
            calls_count += 1
            requested_to_fetch.extend(keys)
            return {k: self._make_dummy_series() for k in keys}

        # Pre-seed p1 in cache
        series_1 = self._make_dummy_series()
        set_cached_weather({p1: series_1}, start, end)

        # Call with p1, p2, p3
        result = fetch_weather_with_cache([p1, p2, p3], start, end, fake_fetcher)

        assert len(result) == 3
        assert calls_count == 1
        # Fetcher was called ONLY for p2 and p3 (p1 was cached)
        assert set(requested_to_fetch) == {p2, p3}
        assert p1 not in requested_to_fetch

    def test_partial_cache_on_chunk_failure_retry_only_fetches_missing_with_callback_client(self):
        """Succeeded chunks are cached on midway failure and retry fetches only missing points."""
        chunk1 = [(40.0 + (i * 0.01), -80.0) for i in range(50)]
        chunk2 = [(41.0 + (i * 0.01), -80.0) for i in range(50)]
        all_points = chunk1 + chunk2
        start = "2026-11-02"
        end = "2026-11-02"

        calls_received: list[list[tuple[float, float]]] = []
        attempt = 0

        def fake_weather_client(
            keys: list[tuple[float, float]],
            s_date: str,
            e_date: str,
            on_chunk_success: Any = None,
        ) -> dict[tuple[float, float], HourlySeries]:
            nonlocal attempt
            attempt += 1
            calls_received.append(list(keys))

            # Simulate chunking behavior: 50 items per chunk
            res: dict[tuple[float, float], HourlySeries] = {}
            for i in range(0, len(keys), 50):
                sub_chunk = keys[i : i + 50]
                if attempt == 1 and i >= 50:
                    # Fail on chunk 2 on first attempt
                    raise WeatherDataError("Upstream rate limited", status=429, retry_after_s=5)
                sub_res = {k: self._make_dummy_series() for k in sub_chunk}
                if on_chunk_success is not None:
                    on_chunk_success(sub_res)
                res.update(sub_res)
            return res

        # Attempt 1: fails on chunk 2, but chunk 1 should be cached
        with pytest.raises(WeatherDataError) as exc_info:
            fetch_weather_with_cache(all_points, start, end, fake_weather_client)

        assert exc_info.value.status == 429
        assert len(calls_received) == 1
        assert len(calls_received[0]) == 100

        # Attempt 2 (immediate retry): chunk 1 is in cache, so only chunk 2 is requested!
        result = fetch_weather_with_cache(all_points, start, end, fake_weather_client)

        assert len(result) == 100
        assert len(calls_received) == 2
        # On second attempt, fake_weather_client was called ONLY with chunk 2 (50 points)
        assert len(calls_received[1]) == 50
        assert set(calls_received[1]) == set(chunk2)

    def test_partial_cache_on_chunk_failure_retry_with_chunk_size_client(self):
        """When a fake client exposes chunk_size and fails midway, succeeded chunks are cached."""
        chunk1 = [(30.0 + (i * 0.01), -90.0) for i in range(25)]
        chunk2 = [(31.0 + (i * 0.01), -90.0) for i in range(25)]
        all_points = chunk1 + chunk2
        start = "2026-11-02"
        end = "2026-11-02"

        calls_received: list[list[tuple[float, float]]] = []
        attempt = 0

        class FakeChunkedClient:
            chunk_size = 25

            def __call__(
                self,
                keys: list[tuple[float, float]],
                s_date: str,
                e_date: str,
            ) -> dict[tuple[float, float], HourlySeries]:
                nonlocal attempt
                attempt += 1
                calls_received.append(list(keys))
                if attempt == 2:
                    # Second chunk in attempt 1
                    raise WeatherDataError("Simulated 500 error", status=500)
                return {k: TestWeatherCacheAvoidsRefetch._make_dummy_series(self) for k in keys}

        client = FakeChunkedClient()

        # Call 1: chunk 1 succeeds (attempt 1), chunk 2 fails (attempt 2)
        with pytest.raises(WeatherDataError):
            fetch_weather_with_cache(all_points, start, end, client)

        assert len(calls_received) == 2

        # Immediate retry: chunk 1 is cached, so only chunk 2 is requested!
        result = fetch_weather_with_cache(all_points, start, end, client)
        assert len(result) == 50
        # Total calls now 3: attempt 3 requested ONLY chunk 2
        assert len(calls_received) == 3
        assert set(calls_received[2]) == set(chunk2)
