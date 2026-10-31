"""Heatmap builder for Spotter Truck Routing.

Implements Section 14 and Decision D-20 of ARCHITECTURE.md:
  - build_heatmap: constructs 49-hour forecast arrays for points along the trip corridor.
  - Risk values in 0..4 (RiskLevel minus 1).
  - Uses the same classify_checkpoint as routes, making the heatmap load-aware.
  - Rounding: wind 1 decimal, rain 2 decimals, snow 2 decimals.
  - Missing hours repeat the last available value and set truncated=True.
"""

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone
from typing import Any

from domain.constants import HEATMAP_HOURS, WEATHER_GRID_DECIMALS
from domain.models import HeatmapPoint, HeatmapResult, HourlySeries, LatLng, WeatherSample
from domain.risk import classify_checkpoint

# Re-export for convenience
HeatmapData = HeatmapResult


def _extract_coordinates(point: Any) -> tuple[float, float]:
    """Extract (lat, lng) floats from a LatLng, tuple, list, or dict."""
    if isinstance(point, LatLng):
        return point.lat, point.lng
    if isinstance(point, (tuple, list)) and len(point) >= 2:
        return float(point[0]), float(point[1])
    if isinstance(point, dict) and "lat" in point and "lng" in point:
        return float(point["lat"]), float(point["lng"])
    if hasattr(point, "lat") and hasattr(point, "lng"):
        return float(point.lat), float(point.lng)
    raise ValueError(f"Unsupported point coordinate format: {point!r}")


def _normalize_time(dt: datetime) -> datetime:
    """Normalize a datetime to UTC floored to the hour."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.replace(minute=0, second=0, microsecond=0)


def _parse_time(t: datetime | str) -> datetime:
    """Parse and normalize timestamp to UTC hour."""
    if isinstance(t, str):
        t = datetime.fromisoformat(t.replace("Z", "+00:00"))
    return _normalize_time(t)


def _find_series(
    series_by_key: Mapping[Any, HourlySeries],
    grid_lat: float,
    grid_lng: float,
    raw_lat: float,
    raw_lng: float,
    orig_point: Any,
) -> HourlySeries:
    """Locate the HourlySeries for a point from series_by_key."""
    grid_key = (grid_lat, grid_lng)
    if grid_key in series_by_key:
        return series_by_key[grid_key]

    raw_key = (raw_lat, raw_lng)
    if raw_key in series_by_key:
        return series_by_key[raw_key]

    if orig_point in series_by_key:
        return series_by_key[orig_point]

    lat_lng_key = LatLng(raw_lat, raw_lng)
    if lat_lng_key in series_by_key:
        return series_by_key[lat_lng_key]

    grid_lat_lng_key = LatLng(grid_lat, grid_lng)
    if grid_lat_lng_key in series_by_key:
        return series_by_key[grid_lat_lng_key]

    raise KeyError(f"No weather series found for point ({grid_lat}, {grid_lng})")


def build_heatmap(
    points: Sequence[Any],
    series_by_key: Mapping[Any, HourlySeries],
    departure_hour_utc: datetime | str,
    load_weight_lb: int,
) -> HeatmapResult:
    """Build 49-hour risk and metric arrays for heatmap points along the corridor.

    Args:
        points: Sequence of LatLng, (lat, lng) tuples, or dicts along the corridor.
        series_by_key: Mapping from grid keys (round(lat, 2), round(lng, 2)) to HourlySeries.
        departure_hour_utc: Trip departure timestamp (floored to UTC hour, hour 0).
        load_weight_lb: Cargo load weight in pounds used for load-aware classification.

    Returns:
        HeatmapResult containing 49-hour arrays per point and truncation status.
    """
    if isinstance(departure_hour_utc, str):
        start_hour = _parse_time(departure_hour_utc)
    else:
        start_hour = _normalize_time(departure_hour_utc)

    if not points:
        return HeatmapResult(
            start_utc=start_hour,
            hours=HEATMAP_HOURS,
            truncated=False,
            points=[],
        )

    is_truncated = False
    heatmap_points: list[HeatmapPoint] = []

    for point in points:
        raw_lat, raw_lng = _extract_coordinates(point)
        grid_lat = round(raw_lat, WEATHER_GRID_DECIMALS)
        grid_lng = round(raw_lng, WEATHER_GRID_DECIMALS)

        series = _find_series(
            series_by_key,
            grid_lat=grid_lat,
            grid_lng=grid_lng,
            raw_lat=raw_lat,
            raw_lng=raw_lng,
            orig_point=point,
        )

        time_to_idx = {_parse_time(t): i for i, t in enumerate(series.times_utc)}

        risk_arr: list[int] = []
        wind_arr: list[float] = []
        rain_arr: list[float] = []
        snow_arr: list[float] = []

        last_sample: WeatherSample | None = None

        for h in range(HEATMAP_HOURS):
            target_time = start_hour + timedelta(hours=h)

            if target_time in time_to_idx:
                idx = time_to_idx[target_time]
                gust = (
                    series.wind_gust_mph[idx]
                    if idx < len(series.wind_gust_mph)
                    else series.wind_mph[idx]
                )
                sample = WeatherSample(
                    wind_mph=series.wind_mph[idx],
                    wind_gust_mph=gust,
                    rain_in_hr=series.rain_in_hr[idx],
                    snow_in_hr=series.snow_in_hr[idx],
                )
                last_sample = sample
            else:
                is_truncated = True
                if last_sample is not None:
                    sample = last_sample
                elif len(series.times_utc) > 0:
                    # Target time before earliest timestamp: use first available
                    gust = (
                        series.wind_gust_mph[0]
                        if len(series.wind_gust_mph) > 0
                        else series.wind_mph[0]
                    )
                    sample = WeatherSample(
                        wind_mph=series.wind_mph[0],
                        wind_gust_mph=gust,
                        rain_in_hr=series.rain_in_hr[0],
                        snow_in_hr=series.snow_in_hr[0],
                    )
                    last_sample = sample
                else:
                    sample = WeatherSample(0.0, 0.0, 0.0, 0.0)
                    last_sample = sample

            # Classify using the same checkpoint classifier for load awareness (D-20)
            assessment = classify_checkpoint(sample, load_weight_lb)

            # Risk integer in 0..4 (RiskLevel minus 1)
            risk_arr.append(int(assessment.level) - 1)
            wind_arr.append(round(sample.wind_mph, 1))
            rain_arr.append(round(sample.rain_in_hr, 2))
            snow_arr.append(round(sample.snow_in_hr, 2))

        heatmap_points.append(
            HeatmapPoint(
                lat=grid_lat,
                lng=grid_lng,
                risk=risk_arr,
                wind_mph=wind_arr,
                rain_in_hr=rain_arr,
                snow_in_hr=snow_arr,
            )
        )

    return HeatmapResult(
        start_utc=start_hour,
        hours=HEATMAP_HOURS,
        truncated=is_truncated,
        points=heatmap_points,
    )
