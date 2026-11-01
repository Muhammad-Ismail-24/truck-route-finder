"""Cache helper and key builders for Spotter Truck Routing.

Implements Section 12.5 and Section 19 of ARCHITECTURE.md:
  - Key builders and TTLs:
    * wx:v1:{lat2}:{lng2}:{start_date}:{end_date} (TTL: 30 min)
    * route:v1:{sha1(origin,dest,departure_hour,load_bucket)} (TTL: 10 min)
    * suggest:v1:{lowercased query} (TTL: 24 h)
  - load_bucket = load_weight_lb // 5000.
  - Thin wrapper over Django cache framework.
  - Planner reads from cache first and only fetches missing weather points.
"""

import hashlib
import inspect
import threading
from collections.abc import Callable, Sequence
from datetime import date, datetime, timezone
from typing import Any

from django.core.cache import cache

from domain.models import HourlySeries

WEATHER_CACHE_TTL_S: int = 30 * 60  # 30 minutes
ROUTE_CACHE_TTL_S: int = 10 * 60  # 10 minutes
SUGGEST_CACHE_TTL_S: int = 24 * 60 * 60  # 24 hours

__all__ = [
    "ROUTE_CACHE_TTL_S",
    "SUGGEST_CACHE_TTL_S",
    "WEATHER_CACHE_TTL_S",
    "build_route_cache_key",
    "build_suggest_cache_key",
    "build_weather_cache_key",
    "cache_get",
    "cache_set",
    "clear",
    "delete",
    "fetch_weather_with_cache",
    "get",
    "get_cached_weather",
    "get_many",
    "set",
    "set_cached_weather",
    "set_many",
]


def _format_date(d: str | date | datetime) -> str:
    """Format date to 'YYYY-MM-DD'."""
    if isinstance(d, str):
        return d[:10]
    if isinstance(d, datetime):
        return d.strftime("%Y-%m-%d")
    if isinstance(d, date):
        return d.isoformat()
    raise ValueError(f"Unsupported date type: {type(d)!r}")


def _format_coord(point: Any) -> str:
    """Format coordinates to 5 decimal places: '{lat:.5f},{lng:.5f}'."""
    if isinstance(point, (tuple, list)) and len(point) >= 2:
        return f"{round(float(point[0]), 5):.5f},{round(float(point[1]), 5):.5f}"
    if hasattr(point, "lat") and hasattr(point, "lng"):
        return f"{round(float(point.lat), 5):.5f},{round(float(point.lng), 5):.5f}"
    if isinstance(point, dict) and "lat" in point and "lng" in point:
        return f"{round(float(point['lat']), 5):.5f},{round(float(point['lng']), 5):.5f}"
    if isinstance(point, str):
        return point.strip()
    raise ValueError(f"Unsupported coordinate format: {point!r}")


def _format_departure_hour(dep: datetime | str) -> str:
    """Format departure hour as UTC ISO-8601 hour string: 'YYYY-MM-DDTHH:00:00Z'."""
    if isinstance(dep, str):
        dep = datetime.fromisoformat(dep.replace("Z", "+00:00"))
    if dep.tzinfo is None:
        dep = dep.replace(tzinfo=timezone.utc)
    else:
        dep = dep.astimezone(timezone.utc)
    floored = dep.replace(minute=0, second=0, microsecond=0)
    return floored.strftime("%Y-%m-%dT%H:00:00Z")


def build_weather_cache_key(
    lat: float,
    lng: float,
    start_date: str | date | datetime,
    end_date: str | date | datetime,
) -> str:
    """Build cache key for weather grid point: 'wx:v1:{lat2}:{lng2}:{start_date}:{end_date}'."""
    lat2 = f"{round(float(lat), 2):.2f}"
    lng2 = f"{round(float(lng), 2):.2f}"
    s_date = _format_date(start_date)
    e_date = _format_date(end_date)
    return f"wx:v1:{lat2}:{lng2}:{s_date}:{e_date}"


def build_route_cache_key(
    origin: Any,
    dest: Any,
    departure_hour: str | datetime,
    load_weight_lb: int,
) -> str:
    """Build cache key for route: 'route:v1:{sha1(origin,dest,departure_hour,load_bucket)}'."""
    load_bucket = int(load_weight_lb) // 5000
    origin_str = _format_coord(origin)
    dest_str = _format_coord(dest)
    dep_str = _format_departure_hour(departure_hour)
    payload = f"{origin_str}|{dest_str}|{dep_str}|{load_bucket}"
    sha1_hash = hashlib.sha1(payload.encode("utf-8")).hexdigest()
    return f"route:v1:{sha1_hash}"


def build_suggest_cache_key(query: str) -> str:
    """Build cache key for place autosuggest: 'suggest:v1:{lowercased query}'."""
    return f"suggest:v1:{query.strip().lower()}"


def get(key: str, default: Any = None) -> Any:
    """Retrieve value from cache by key."""
    return cache.get(key, default)


cache_get = get


def set(key: str, value: Any, timeout: int | None = None) -> None:
    """Store value into cache with specified timeout in seconds."""
    cache.set(key, value, timeout=timeout)


cache_set = set


def get_many(keys: Sequence[str]) -> dict[str, Any]:
    """Retrieve multiple values from cache."""
    return cache.get_many(keys)


def set_many(mapping: dict[str, Any], timeout: int | None = None) -> None:
    """Store multiple values into cache with specified timeout in seconds."""
    cache.set_many(mapping, timeout=timeout)


def delete(key: str) -> None:
    """Delete a key from cache."""
    cache.delete(key)


def clear() -> None:
    """Clear all keys from cache."""
    cache.clear()


def get_cached_weather(
    grid_keys: Sequence[tuple[float, float]],
    start_date: str | date | datetime,
    end_date: str | date | datetime,
) -> tuple[dict[tuple[float, float], HourlySeries], list[tuple[float, float]]]:
    """Retrieve cached hourly weather series for grid keys.

    Returns:
        tuple of (cached_series_by_grid_key, missing_grid_keys).
    """
    key_to_grid: dict[str, tuple[float, float]] = {}
    for gk in grid_keys:
        ckey = build_weather_cache_key(gk[0], gk[1], start_date, end_date)
        key_to_grid[ckey] = (round(float(gk[0]), 2), round(float(gk[1]), 2))

    cache_keys = list(key_to_grid.keys())
    cached_entries = get_many(cache_keys)

    found: dict[tuple[float, float], HourlySeries] = {}
    missing: list[tuple[float, float]] = []

    for ckey, gk in key_to_grid.items():
        if ckey in cached_entries and cached_entries[ckey] is not None:
            found[gk] = cached_entries[ckey]
        else:
            missing.append(gk)

    return found, missing


def set_cached_weather(
    weather_by_key: dict[tuple[float, float], HourlySeries],
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timeout: int = WEATHER_CACHE_TTL_S,
) -> None:
    """Store hourly weather series for grid keys into cache with standard TTL."""
    if not weather_by_key:
        return
    mapping: dict[str, Any] = {}
    for gk, series in weather_by_key.items():
        ckey = build_weather_cache_key(gk[0], gk[1], start_date, end_date)
        mapping[ckey] = series
    set_many(mapping, timeout=timeout)


WeatherFetcher = Callable[
    [list[tuple[float, float]], str, str], dict[tuple[float, float], HourlySeries]
]


def fetch_weather_with_cache(
    grid_keys: Sequence[tuple[float, float]],
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    fetcher: WeatherFetcher,
) -> dict[tuple[float, float], HourlySeries]:
    """Fetch weather for grid keys, reading cache first and only querying missing keys."""
    if not grid_keys:
        return {}

    found, missing = get_cached_weather(grid_keys, start_date, end_date)
    if missing:
        s_date = _format_date(start_date)
        e_date = _format_date(end_date)
        cache_lock = threading.Lock()

        def on_chunk_success(chunk_dict: dict[tuple[float, float], HourlySeries]) -> None:
            if chunk_dict:
                with cache_lock:
                    set_cached_weather(chunk_dict, start_date, end_date)
                    found.update(chunk_dict)

        accepts_cb = False
        try:
            sig = inspect.signature(fetcher)
            accepts_cb = "on_chunk_success" in sig.parameters or any(
                p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()
            )
        except (ValueError, TypeError):
            accepts_cb = False

        if accepts_cb:
            fetched = fetcher(missing, s_date, e_date, on_chunk_success=on_chunk_success)
        else:
            chunk_size = getattr(fetcher, "chunk_size", None)
            if isinstance(chunk_size, int) and chunk_size > 0 and len(missing) > chunk_size:
                fetched: dict[tuple[float, float], HourlySeries] = {}
                for i in range(0, len(missing), chunk_size):
                    chunk_keys = missing[i : i + chunk_size]
                    part = fetcher(chunk_keys, s_date, e_date)
                    if part:
                        on_chunk_success(part)
                        fetched.update(part)
            else:
                fetched = fetcher(missing, s_date, e_date)

        if fetched:
            set_cached_weather(fetched, start_date, end_date)
            found.update(fetched)

    return found
