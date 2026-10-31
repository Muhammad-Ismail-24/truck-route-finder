"""Weather grid planning, deduplication, date range, and heatmap thinning.

Implements Sections 12.2, 12.3, 12.4, and Section 19 of ARCHITECTURE.md:
  - grid_key(lat, lng): rounds to 2 decimals (~1.1 km).
  - build_weather_points: unique union of grid keys for checkpoints and heatmap.
  - weather_date_range(dep, etas): start = floor_hour(dep), end = max(max_fh, dep+48h).
  - sample_heatmap_points: samples every HEATMAP_INTERVAL_MILES (25), union across routes.
  - thin_heatmap_points: doubles interval (25 -> 50 -> 100) until heatmap-only <= 1000.
    Checkpoints are never thinned.
  - build_weather_grid: orchestrates thinning, point building, and emits notice HEATMAP_THINNED.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from domain.constants import (
    HEATMAP_INTERVAL_MILES,
    MAX_UNIQUE_WEATHER_POINTS,
    WEATHER_GRID_DECIMALS,
)
from domain.eta import nearest_forecast_hour
from domain.geometry import cumulative_miles, point_at_mile
from domain.models import Checkpoint, LatLng, RouteGeometry

NOTICE_HEATMAP_THINNED: dict[str, str] = {
    "code": "HEATMAP_THINNED",
    "message": "Heatmap sampling interval was increased to stay within weather query limits.",
}

__all__ = [
    "NOTICE_HEATMAP_THINNED",
    "WeatherGridResult",
    "build_weather_grid",
    "build_weather_points",
    "grid_key",
    "point_grid_key",
    "sample_heatmap_points",
    "sample_route_heatmap_points",
    "thin_heatmap_points",
    "weather_date_range",
]


@dataclass(frozen=True, slots=True)
class WeatherGridResult:
    """Result of weather grid planning including weather keys, heatmap points, and thinning flag."""

    weather_keys: list[tuple[float, float]]
    heatmap_points: list[LatLng]
    heatmap_thinned: bool
    heatmap_interval_miles: float
    notice: dict[str, str] | None


def grid_key(lat: float, lng: float) -> tuple[float, float]:
    """Round coordinates to 2 decimal places (~1.1 km resolution)."""
    return (round(float(lat), WEATHER_GRID_DECIMALS), round(float(lng), WEATHER_GRID_DECIMALS))


def point_grid_key(point: Any) -> tuple[float, float]:
    """Extract coordinates from LatLng, Checkpoint, tuple, or dict and return grid_key."""
    if hasattr(point, "position"):
        pos = point.position
        return grid_key(pos.lat, pos.lng)
    if isinstance(point, (tuple, list)) and len(point) >= 2:
        return grid_key(point[0], point[1])
    if hasattr(point, "lat") and hasattr(point, "lng"):
        return grid_key(point.lat, point.lng)
    if isinstance(point, dict) and "lat" in point and "lng" in point:
        return grid_key(point["lat"], point["lng"])
    raise ValueError(f"Unsupported coordinate point format: {point!r}")


def _extract_grid_keys(item: Any) -> list[tuple[float, float]]:
    """Recursively extract grid keys from collections of checkpoints or points."""
    if item is None:
        return []
    if isinstance(item, (list, tuple, set)):
        keys: list[tuple[float, float]] = []
        for elem in item:
            keys.extend(_extract_grid_keys(elem))
        return keys
    if isinstance(item, Mapping):
        keys = []
        for val in item.values():
            keys.extend(_extract_grid_keys(val))
        return keys
    try:
        return [point_grid_key(item)]
    except (ValueError, TypeError):
        return []


def _extract_forecast_hours(item: Any) -> list[datetime]:
    """Recursively extract forecast hour timestamps from datetimes or checkpoints."""
    if item is None:
        return []
    if isinstance(item, datetime):
        dt = item if item.tzinfo is not None else item.replace(tzinfo=timezone.utc)
        return [nearest_forecast_hour(dt.astimezone(timezone.utc))]
    if hasattr(item, "forecast_hour_utc"):
        fh = item.forecast_hour_utc
        dt = fh if fh.tzinfo is not None else fh.replace(tzinfo=timezone.utc)
        return [dt.astimezone(timezone.utc)]
    if hasattr(item, "eta_utc"):
        eta = item.eta_utc
        dt = eta if eta.tzinfo is not None else eta.replace(tzinfo=timezone.utc)
        return [nearest_forecast_hour(dt.astimezone(timezone.utc))]
    if isinstance(item, (list, tuple, set)):
        res: list[datetime] = []
        for elem in item:
            res.extend(_extract_forecast_hours(elem))
        return res
    if isinstance(item, Mapping):
        res = []
        for val in item.values():
            res.extend(_extract_forecast_hours(val))
        return res
    return []


def weather_date_range(
    departure_utc: datetime | str,
    all_etas: Any = None,
) -> tuple[date, date]:
    """Calculate date range: start = floor_hour(dep), end = max(max_fh, dep+48h) (Section 12.2)."""
    if isinstance(departure_utc, str):
        dep_dt = datetime.fromisoformat(departure_utc.replace("Z", "+00:00"))
    else:
        dep_dt = departure_utc

    if dep_dt.tzinfo is None:
        dep_dt = dep_dt.replace(tzinfo=timezone.utc)
    else:
        dep_dt = dep_dt.astimezone(timezone.utc)

    dep_hour = dep_dt.replace(minute=0, second=0, microsecond=0)
    start_date = dep_hour.date()

    hours = _extract_forecast_hours(all_etas)
    max_forecast_hour = max(hours) if hours else dep_hour
    horizon_48h = dep_hour + timedelta(hours=48)
    end_hour = max(max_forecast_hour, horizon_48h)
    end_date = end_hour.date()

    return start_date, end_date


def sample_route_heatmap_points(
    route: RouteGeometry,
    interval_miles: float = HEATMAP_INTERVAL_MILES,
) -> list[LatLng]:
    """Sample points along a single route at interval, always including destination."""
    if not route.points:
        return []

    cum = cumulative_miles(route.points)
    total = cum[-1]
    if total <= 1e-6:
        return [route.points[0]]

    sampled: list[LatLng] = [route.points[0]]
    curr = float(interval_miles)
    while curr < total - 1e-6:
        sampled.append(point_at_mile(route.points, cum, curr))
        curr += float(interval_miles)

    # Destination is always included per Section 12.3
    dest = route.points[-1]
    last_sampled = sampled[-1]
    if abs(last_sampled.lat - dest.lat) > 1e-7 or abs(last_sampled.lng - dest.lng) > 1e-7:
        sampled.append(dest)

    return sampled


def sample_heatmap_points(
    routes: Sequence[RouteGeometry],
    interval_miles: float = HEATMAP_INTERVAL_MILES,
) -> list[LatLng]:
    """Sample points every interval_miles across all routes, deduped by grid key (Section 12.3)."""
    seen_grid_keys: set[tuple[float, float]] = set()
    heatmap_points: list[LatLng] = []

    for route in routes:
        pts = sample_route_heatmap_points(route, interval_miles=interval_miles)
        for pt in pts:
            gk = grid_key(pt.lat, pt.lng)
            if gk not in seen_grid_keys:
                seen_grid_keys.add(gk)
                heatmap_points.append(pt)

    return heatmap_points


def thin_heatmap_points(
    routes: Sequence[RouteGeometry],
    checkpoint_keys: set[tuple[float, float]] | None = None,
    initial_interval: float = HEATMAP_INTERVAL_MILES,
    max_unique_points: int = MAX_UNIQUE_WEATHER_POINTS,
) -> tuple[list[LatLng], float, bool]:
    """Sample and thin heatmap points until unique heatmap-only points <= max_unique_points.

    Doubles interval (25 -> 50 -> 100) if needed (Section 12.4). Checkpoints are never thinned.

    Returns:
        tuple of (final_heatmap_points, final_interval, was_thinned).
    """
    cp_keys = checkpoint_keys if checkpoint_keys is not None else set()
    interval = float(initial_interval)
    was_thinned = False

    while True:
        pts = sample_heatmap_points(routes, interval_miles=interval)
        heatmap_only_keys = {grid_key(p.lat, p.lng) for p in pts} - cp_keys

        if len(heatmap_only_keys) <= max_unique_points or interval >= 1_000_000:
            break

        was_thinned = True
        interval *= 2.0

    return pts, interval, was_thinned


def build_weather_points(
    routes: Sequence[RouteGeometry] | None = None,
    checkpoints_by_route: Any = None,
    heatmap_points: Sequence[Any] | None = None,
) -> list[tuple[float, float]]:
    """Return unique union of grid keys used by checkpoints and heatmap points (Section 12.2)."""
    cp_keys = _extract_grid_keys(checkpoints_by_route)

    if heatmap_points is not None:
        hp_keys = _extract_grid_keys(heatmap_points)
    elif routes is not None:
        sampled = sample_heatmap_points(routes, interval_miles=HEATMAP_INTERVAL_MILES)
        hp_keys = [grid_key(p.lat, p.lng) for p in sampled]
    else:
        hp_keys = []

    combined = cp_keys + hp_keys
    return list(dict.fromkeys(combined))


def build_weather_grid(
    routes: Sequence[RouteGeometry],
    checkpoints_by_route: Sequence[Sequence[Checkpoint]] | Mapping[str, Sequence[Checkpoint]],
    initial_interval: float = HEATMAP_INTERVAL_MILES,
    max_unique_points: int = MAX_UNIQUE_WEATHER_POINTS,
) -> WeatherGridResult:
    """Build complete weather grid, thinning heatmap points if necessary to respect budget."""
    cp_keys_list = _extract_grid_keys(checkpoints_by_route)
    cp_keys_set = set(cp_keys_list)

    hp_points, final_interval, was_thinned = thin_heatmap_points(
        routes=routes,
        checkpoint_keys=cp_keys_set,
        initial_interval=initial_interval,
        max_unique_points=max_unique_points,
    )

    weather_keys = build_weather_points(
        routes=routes,
        checkpoints_by_route=checkpoints_by_route,
        heatmap_points=hp_points,
    )

    notice = NOTICE_HEATMAP_THINNED if was_thinned else None

    return WeatherGridResult(
        weather_keys=weather_keys,
        heatmap_points=hp_points,
        heatmap_thinned=was_thinned,
        heatmap_interval_miles=final_interval,
        notice=notice,
    )
