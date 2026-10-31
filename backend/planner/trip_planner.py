"""Trip planner orchestration for Spotter Truck Routing.

Implements Sections 5, 12.1, 15.3, and 18 of ARCHITECTURE.md:
  - plan_trip(request, routing_client, weather_client, cache):
    1. Fetch truck routes (up to 3) via routing_client.
    2. Build checkpoints per route at the selected interval with buffered duration and ETAs.
    3. Build weather points and apply heatmap thinning if points exceed cap.
    4. Fetch hourly weather forecasts (cached).
    5. Classify checkpoint risk with load rules.
    6. Summarize each route (miles by level, avg risk, max level).
    7. Rank routes lexicographically and select recommended route with reasons.
    8. Build 49-hour corridor heatmap.
    9. Construct PlanResult with all notices and metadata.
"""

import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from clients.here_routing import fetch_truck_routes
from clients.open_meteo import fetch_hourly
from domain.aggregation import summarize_route
from domain.constants import (
    DEFAULT_INTERVAL_MILES,
    DELAY_BUFFER_DEFAULT,
    HEATMAP_INTERVAL_MILES,
    LONG_RANGE_NOTICE_DAYS,
    TRUCK_TARE_LB_DEFAULT,
)
from domain.heatmap import build_heatmap
from domain.models import (
    Checkpoint,
    HeatmapResult,
    HourlySeries,
    RiskAssessment,
    RouteGeometry,
    RouteSummary,
    WeatherSample,
)
from domain.ranking import RouteRankingResult, rank_routes
from domain.risk import classify_checkpoint
from domain.sampling import build_checkpoints
from planner import cache as default_cache_module
from planner.weather_grid import build_weather_grid, grid_key, weather_date_range

HERE_ORDER_LABELS: dict[str, str] = {
    "route-1": "Route A",
    "route-2": "Route B",
    "route-3": "Route C",
}

__all__ = [
    "CheckpointDetail",
    "HERE_ORDER_LABELS",
    "PlanRequest",
    "PlanResult",
    "RouteDetail",
    "plan_trip",
]


@dataclass(frozen=True, slots=True)
class CheckpointDetail:
    """A checkpoint paired with its forecast weather sample and risk assessment."""

    checkpoint: Checkpoint
    weather: WeatherSample
    risk: RiskAssessment


@dataclass(frozen=True, slots=True)
class RouteDetail:
    """Complete detail for a single evaluated route."""

    route: RouteGeometry
    summary: RouteSummary
    checkpoints: list[CheckpointDetail]
    rank: int
    is_recommended: bool
    label: str


@dataclass(frozen=True, slots=True)
class PlanRequest:
    """Input payload for planning a multi-route weather-aware truck trip."""

    origin: Any
    destination: Any
    departure_time: datetime | str
    load_weight_lb: int
    checkpoint_interval_miles: float = float(DEFAULT_INTERVAL_MILES)


@dataclass(frozen=True, slots=True)
class PlanResult:
    """Complete trip planning result ready for presentation."""

    request_id: str
    generated_at_utc: datetime
    input_data: dict[str, Any]
    settings: dict[str, Any]
    routes: list[RouteDetail]
    recommendation: RouteRankingResult
    heatmap: HeatmapResult
    notices: list[dict[str, str]]


def _parse_utc_datetime(dt_val: datetime | str) -> datetime:
    """Parse string or datetime to UTC timezone-aware datetime."""
    if isinstance(dt_val, str):
        parsed = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
    else:
        parsed = dt_val
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _extract_coord_dict(point: Any) -> dict[str, Any]:
    """Normalize coordinate object/dict/tuple into dict with label, lat, and lng."""
    if isinstance(point, Mapping):
        return {
            "label": str(point.get("label", "")),
            "lat": float(point["lat"]),
            "lng": float(point["lng"]),
        }
    label = getattr(point, "label", "")
    lat = getattr(point, "lat", None)
    lng = getattr(point, "lng", None)
    if lat is not None and lng is not None:
        return {"label": str(label), "lat": float(lat), "lng": float(lng)}
    if isinstance(point, (tuple, list)) and len(point) >= 2:
        return {"label": str(label), "lat": float(point[0]), "lng": float(point[1])}
    raise ValueError(f"Unsupported point coordinate object: {point!r}")


def plan_trip(
    request: PlanRequest | Mapping[str, Any],
    routing_client: Callable[..., list[RouteGeometry]] = fetch_truck_routes,
    weather_client: Callable[..., dict[tuple[float, float], HourlySeries]] = fetch_hourly,
    cache: Any = default_cache_module,
    now: datetime | None = None,
) -> PlanResult:
    """Plan up to 3 truck routes, evaluate weather risk along checkpoints, and rank options.

    Args:
        request: PlanRequest or mapping containing origin, destination, departure, load weight.
        routing_client: Callable returning list of RouteGeometry (default HERE Routing).
        weather_client: Callable returning dict of HourlySeries (default Open-Meteo).
        cache: Cache module implementing get/set/fetch_weather_with_cache.
        now: Optional current timestamp override for deterministic notice testing.

    Returns:
        PlanResult with evaluated routes ordered by rank, recommendation, heatmap, and notices.
    """
    now_utc = now if now is not None else datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    # 1. Parse request parameters
    if isinstance(request, Mapping):
        origin_raw = request["origin"]
        dest_raw = request["destination"]
        dep_raw = request["departure_time"]
        load_weight_lb = int(request["load_weight_lb"])
        interval_mi = float(request.get("checkpoint_interval_miles", DEFAULT_INTERVAL_MILES))
    else:
        origin_raw = request.origin
        dest_raw = request.destination
        dep_raw = request.departure_time
        load_weight_lb = int(request.load_weight_lb)
        interval_mi = float(request.checkpoint_interval_miles)

    departure_utc = _parse_utc_datetime(dep_raw)
    departure_hour_utc = departure_utc.replace(minute=0, second=0, microsecond=0)
    origin_dict = _extract_coord_dict(origin_raw)
    dest_dict = _extract_coord_dict(dest_raw)

    notices: list[dict[str, str]] = []

    # Check long-range forecast notice (> 5 days)
    if departure_utc > now_utc + timedelta(days=LONG_RANGE_NOTICE_DAYS):
        notices.append({
            "code": "LONG_RANGE_FORECAST",
            "message": "Departure is more than 5 days away; forecast accuracy is lower.",
        })

    # 2. Fetch routes (with caching if available)
    routes: list[RouteGeometry]
    route_cache_key = None
    if cache is not None and hasattr(cache, "build_route_cache_key"):
        route_cache_key = cache.build_route_cache_key(
            origin_raw, dest_raw, departure_hour_utc, load_weight_lb
        )
        cached_routes = cache.get(route_cache_key)
        if cached_routes is not None:
            routes = list(cached_routes)
        else:
            routes = routing_client(
                origin=origin_raw,
                destination=dest_raw,
                departure_utc=departure_utc,
                load_weight_lb=load_weight_lb,
            )
            if hasattr(cache, "set") and hasattr(cache, "ROUTE_CACHE_TTL_S"):
                cache.set(route_cache_key, routes, timeout=cache.ROUTE_CACHE_TTL_S)
    else:
        routes = routing_client(
            origin=origin_raw,
            destination=dest_raw,
            departure_utc=departure_utc,
            load_weight_lb=load_weight_lb,
        )

    # Section 18: Notice if fewer than 3 routes returned
    if len(routes) < 3:
        notices.append({
            "code": "FEWER_THAN_3_ROUTES",
            "message": f"Only {len(routes)} route(s) were found.",
        })

    # 3. Build checkpoints per route
    checkpoints_by_route: dict[str, list[Checkpoint]] = {}
    buffered_durations: dict[str, float] = {}

    for route in routes:
        buf_duration = route.base_duration_s * DELAY_BUFFER_DEFAULT
        buffered_durations[route.route_id] = buf_duration
        cps = build_checkpoints(
            route=route,
            interval_miles=interval_mi,
            departure_utc=departure_utc,
            buffered_duration_s=buf_duration,
        )
        checkpoints_by_route[route.route_id] = cps

    # 4. Plan weather grid and heatmap points (with thinning if needed)
    grid_result = build_weather_grid(
        routes=routes,
        checkpoints_by_route=checkpoints_by_route,
        initial_interval=HEATMAP_INTERVAL_MILES,
    )

    if grid_result.heatmap_thinned and grid_result.notice:
        notices.append(grid_result.notice)

    # 5. Fetch weather for all required weather points
    all_etas = [cp.forecast_hour_utc for cps in checkpoints_by_route.values() for cp in cps]
    start_date, end_date = weather_date_range(departure_utc, all_etas)

    if cache is not None and hasattr(cache, "fetch_weather_with_cache"):
        series_by_key = cache.fetch_weather_with_cache(
            grid_result.weather_keys,
            start_date,
            end_date,
            fetcher=weather_client,
        )
    else:
        series_by_key = weather_client(grid_result.weather_keys, start_date, end_date)

    # 6. Classify risk for checkpoints and summarize each route
    route_details_unranked: list[
        tuple[str, RouteGeometry, RouteSummary, list[CheckpointDetail]]
    ] = []
    summaries_dict: dict[str, RouteSummary] = {}
    labels_dict: dict[str, str] = {}

    for route in routes:
        rid = route.route_id
        label = HERE_ORDER_LABELS.get(rid, f"Route {rid.replace('route-', '')}")
        labels_dict[rid] = label

        cps = checkpoints_by_route[rid]
        cp_details: list[CheckpointDetail] = []
        risks_list: list[RiskAssessment] = []

        for cp in cps:
            gk = grid_key(cp.position.lat, cp.position.lng)
            series = series_by_key[gk]

            # Find matching hourly forecast sample nearest to checkpoint forecast hour
            target_time = cp.forecast_hour_utc.replace(minute=0, second=0, microsecond=0)
            if target_time.tzinfo is None:
                target_time = target_time.replace(tzinfo=timezone.utc)

            time_diffs: list[float] = []
            for t in series.times_utc:
                t_utc = (
                    t.replace(tzinfo=timezone.utc)
                    if t.tzinfo is None
                    else t.astimezone(timezone.utc)
                )
                time_diffs.append(abs((t_utc - target_time).total_seconds()))
            nearest_idx = min(range(len(time_diffs)), key=lambda i: time_diffs[i])

            w_gust = (
                series.wind_gust_mph[nearest_idx]
                if nearest_idx < len(series.wind_gust_mph)
                else series.wind_mph[nearest_idx]
            )
            sample = WeatherSample(
                wind_mph=series.wind_mph[nearest_idx],
                wind_gust_mph=w_gust,
                rain_in_hr=series.rain_in_hr[nearest_idx],
                snow_in_hr=series.snow_in_hr[nearest_idx],
            )
            assessment = classify_checkpoint(sample, load_weight_lb)

            cp_details.append(CheckpointDetail(checkpoint=cp, weather=sample, risk=assessment))
            risks_list.append(assessment)

        summary = summarize_route(
            checkpoints=cps,
            risks=risks_list,
            base_duration_s=route.base_duration_s,
            buffered_duration_s=buffered_durations[rid],
            departure_utc=departure_utc,
        )
        summaries_dict[rid] = summary
        route_details_unranked.append((rid, route, summary, cp_details))

    # 7. Rank routes
    ranking_result = rank_routes(summaries_dict, labels=labels_dict)
    rank_by_id = {item.route_id: idx + 1 for idx, item in enumerate(ranking_result.ranking)}

    # 8. Assemble RouteDetail objects and sort by rank (best first)
    final_routes: list[RouteDetail] = []
    for rid, route, summary, cp_details in route_details_unranked:
        rank = rank_by_id[rid]
        is_rec = rid == ranking_result.recommended_route_id
        label = labels_dict[rid]
        final_routes.append(
            RouteDetail(
                route=route,
                summary=summary,
                checkpoints=cp_details,
                rank=rank,
                is_recommended=is_rec,
                label=label,
            )
        )

    final_routes.sort(key=lambda rd: rd.rank)

    # 9. Build 49-hour heatmap
    heatmap_result = build_heatmap(
        points=grid_result.heatmap_points,
        series_by_key=series_by_key,
        departure_hour_utc=departure_hour_utc,
        load_weight_lb=load_weight_lb,
    )

    if heatmap_result.truncated:
        notices.append({
            "code": "HEATMAP_TRUNCATED",
            "message": (
                "Trip duration exceeds available forecast horizon; "
                "later hours repeat the last available forecast."
            ),
        })

    interval_out = int(interval_mi) if interval_mi == int(interval_mi) else interval_mi
    input_data = {
        "origin": origin_dict,
        "destination": dest_dict,
        "departure_utc": departure_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "load_weight_lb": load_weight_lb,
        "checkpoint_interval_miles": interval_out,
    }

    settings = {
        "delay_buffer": DELAY_BUFFER_DEFAULT,
        "heatmap_interval_miles": int(grid_result.heatmap_interval_miles)
        if grid_result.heatmap_interval_miles == int(grid_result.heatmap_interval_miles)
        else grid_result.heatmap_interval_miles,
        "truck_tare_lb": TRUCK_TARE_LB_DEFAULT,
    }

    return PlanResult(
        request_id=str(uuid.uuid4()),
        generated_at_utc=now_utc,
        input_data=input_data,
        settings=settings,
        routes=final_routes,
        recommendation=ranking_result,
        heatmap=heatmap_result,
        notices=notices,
    )
