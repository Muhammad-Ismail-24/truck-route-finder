"""Open-Meteo client for batched hourly weather forecasts.

Implements Section 11.4 and Decisions D-03, D-04, D-13, D-21 of ARCHITECTURE.md:
  - GET https://api.open-meteo.com/v1/forecast
  - Params: latitude, longitude, hourly=wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,
    wind_speed_unit=mph, precipitation_unit=inch, timezone=GMT, start_date=..., end_date=...
  - Chunks of 50 locations, parallel via ThreadPoolExecutor(max_workers=8).
  - Handles list response (multi-location) and object response (single location).
  - rain_in_hr = rain + showers. Any null raises WeatherDataError.
  - GridKey = (round(lat, 2), round(lng, 2)).
"""

from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any

import httpx

from clients.http import WeatherDataError, create_client
from domain.models import HourlySeries

OPEN_METEO_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"
CHUNK_SIZE: int = 50
MAX_WORKERS: int = 8
ATTRIBUTION: str = "Weather data by Open-Meteo.com"

GridKey = tuple[float, float]

__all__ = [
    "ATTRIBUTION",
    "CHUNK_SIZE",
    "GridKey",
    "MAX_WORKERS",
    "WeatherDataError",
    "fetch_hourly",
]


def _to_grid_key(point: Any) -> GridKey:
    """Extract coordinates and round each to 2 decimal places to produce a GridKey."""
    if isinstance(point, (tuple, list)) and len(point) >= 2:
        return (round(float(point[0]), 2), round(float(point[1]), 2))
    if hasattr(point, "lat") and hasattr(point, "lng"):
        return (round(float(point.lat), 2), round(float(point.lng), 2))
    if isinstance(point, dict) and "lat" in point and "lng" in point:
        return (round(float(point["lat"]), 2), round(float(point["lng"]), 2))
    raise ValueError(f"Unsupported coordinate point format: {point!r}")


def _format_date(d: str | date | datetime) -> str:
    """Format date, datetime, or date-string to 'YYYY-MM-DD'."""
    if isinstance(d, str):
        try:
            parsed = datetime.strptime(d[:10], "%Y-%m-%d")
            return parsed.strftime("%Y-%m-%d")
        except ValueError as exc:
            raise ValueError(
                f"Invalid date string format: {d!r}. Expected 'YYYY-MM-DD'."
            ) from exc
    if isinstance(d, datetime):
        return d.strftime("%Y-%m-%d")
    if isinstance(d, date):
        return d.isoformat()
    raise ValueError(f"Unsupported date type: {type(d)!r}")


def _fetch_chunk(
    chunk: list[GridKey],
    start_date_str: str,
    end_date_str: str,
    client: httpx.Client,
) -> dict[GridKey, HourlySeries]:
    """Fetch and parse hourly weather data for a chunk of up to 50 locations."""
    if not chunk:
        return {}

    latitudes = ",".join(str(k[0]) for k in chunk)
    longitudes = ",".join(str(k[1]) for k in chunk)

    params: dict[str, str] = {
        "latitude": latitudes,
        "longitude": longitudes,
        "hourly": "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "start_date": start_date_str,
        "end_date": end_date_str,
    }

    try:
        response = client.get(OPEN_METEO_FORECAST_URL, params=params)
    except httpx.HTTPError as exc:
        raise WeatherDataError(f"HTTP transport error contacting Open-Meteo: {exc}") from exc

    if response.status_code != 200:
        raise WeatherDataError(
            f"Open-Meteo returned status {response.status_code}: {response.text}",
            status=response.status_code,
        )

    try:
        data = response.json()
    except Exception as exc:
        raise WeatherDataError(f"Failed to decode Open-Meteo JSON response: {exc}") from exc

    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = [data]
    else:
        raise WeatherDataError(f"Unexpected response structure from Open-Meteo: {type(data)!r}")

    if len(items) != len(chunk):
        raise WeatherDataError(
            f"Open-Meteo returned {len(items)} results for {len(chunk)} requested locations."
        )

    chunk_results: dict[GridKey, HourlySeries] = {}

    for grid_key, item in zip(chunk, items, strict=True):
        if not isinstance(item, dict):
            raise WeatherDataError(f"Expected object for location {grid_key}, got {type(item)!r}")

        hourly = item.get("hourly")
        if not isinstance(hourly, dict):
            raise WeatherDataError(f"Missing 'hourly' data object for location {grid_key}")

        raw_times = hourly.get("time")
        raw_wind = hourly.get("wind_speed_10m")
        raw_gusts = hourly.get("wind_gusts_10m")
        raw_rain = hourly.get("rain")
        raw_showers = hourly.get("showers")
        raw_snow = hourly.get("snowfall")

        if (
            raw_times is None
            or raw_wind is None
            or raw_gusts is None
            or raw_rain is None
            or raw_showers is None
            or raw_snow is None
        ):
            raise WeatherDataError(
                f"Missing required weather variables in response for location {grid_key}"
            )

        n = len(raw_times)
        if n == 0:
            raise WeatherDataError(f"Empty hourly time series returned for location {grid_key}")

        if not (
            len(raw_wind) == n
            and len(raw_gusts) == n
            and len(raw_rain) == n
            and len(raw_showers) == n
            and len(raw_snow) == n
        ):
            raise WeatherDataError(
                f"Hourly array length mismatch for location {grid_key}: expected {n} entries"
            )

        times_utc: list[datetime] = []
        wind_mph: list[float] = []
        wind_gust_mph: list[float] = []
        rain_in_hr: list[float] = []
        snow_in_hr: list[float] = []

        for i in range(n):
            t_str = raw_times[i]
            w = raw_wind[i]
            g = raw_gusts[i]
            r = raw_rain[i]
            sh = raw_showers[i]
            sn = raw_snow[i]

            if (
                t_str is None
                or w is None
                or g is None
                or r is None
                or sh is None
                or sn is None
            ):
                raise WeatherDataError(
                    f"Null weather value encountered at index {i} for location {grid_key}"
                )

            try:
                dt = datetime.fromisoformat(t_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                else:
                    dt = dt.astimezone(timezone.utc)
            except Exception as exc:
                raise WeatherDataError(
                    f"Invalid timestamp {t_str!r} at index {i} for location {grid_key}"
                ) from exc

            times_utc.append(dt)
            wind_mph.append(float(w))
            wind_gust_mph.append(float(g))
            rain_in_hr.append(float(r) + float(sh))
            snow_in_hr.append(float(sn))

        chunk_results[grid_key] = HourlySeries(
            times_utc=times_utc,
            wind_mph=wind_mph,
            wind_gust_mph=wind_gust_mph,
            rain_in_hr=rain_in_hr,
            snow_in_hr=snow_in_hr,
        )

    return chunk_results


def fetch_hourly(
    points: Sequence[Any],
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    client: httpx.Client | None = None,
) -> dict[GridKey, HourlySeries]:
    """Fetch hourly weather forecast series for a collection of geographic points.

    Args:
        points: Sequence of LatLng, (lat, lng) tuples, dicts, or objects with lat/lng.
        start_date: Start date (inclusive, YYYY-MM-DD, date, or datetime).
        end_date: End date (inclusive, YYYY-MM-DD, date, or datetime).
        client: Optional shared httpx.Client (creates one with standard retry if omitted).

    Returns:
        Mapping from GridKey (round(lat, 2), round(lng, 2)) to HourlySeries.

    Raises:
        WeatherDataError: If Open-Meteo returns HTTP error, invalid structure, or null values.
        ValueError: If dates are invalid or start_date > end_date.
    """
    if not points:
        return {}

    start_date_str = _format_date(start_date)
    end_date_str = _format_date(end_date)
    if start_date_str > end_date_str:
        raise ValueError(
            f"start_date ({start_date_str}) cannot be after end_date ({end_date_str})"
        )

    # Deduplicate points into unique GridKeys while preserving order
    unique_keys: list[GridKey] = list(dict.fromkeys(_to_grid_key(p) for p in points))
    if not unique_keys:
        return {}

    # Chunk into groups of up to CHUNK_SIZE (50) locations
    chunks = [
        unique_keys[i : i + CHUNK_SIZE]
        for i in range(0, len(unique_keys), CHUNK_SIZE)
    ]

    should_close = client is None
    http_client = client if client is not None else create_client()

    results: dict[GridKey, HourlySeries] = {}

    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [
                executor.submit(
                    _fetch_chunk,
                    chunk,
                    start_date_str,
                    end_date_str,
                    http_client,
                )
                for chunk in chunks
            ]
            for future in futures:
                chunk_res = future.result()
                results.update(chunk_res)
    finally:
        if should_close:
            http_client.close()

    return results
