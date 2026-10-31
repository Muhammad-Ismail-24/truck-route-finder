"""Presenters shaping PlanResult into the exact API JSON contract.

Implements Sections 12.6 and 15.3 of ARCHITECTURE.md:
  - Exact JSON contract: request_id, generated_at_utc, input, settings, routes,
    recommendation, heatmap, notices.
  - Geometry simplified via simplify_polyline(..., DISPLAY_GEOMETRY_MAX_POINTS)
    and emitted as GeoJSON [lng, lat] coordinates (GeoJSON standard).
  - Rounding rules: miles 1 decimal in summaries (2 in checkpoints), weather 2 decimals,
    coordinates 5 decimals, avg_risk 2 decimals, duration rounded to integer seconds.
  - Notice codes: FEWER_THAN_3_ROUTES, LONG_RANGE_FORECAST, HEATMAP_THINNED, HEATMAP_TRUNCATED.
"""

from datetime import datetime, timezone
from typing import Any

from domain.constants import DISPLAY_GEOMETRY_MAX_POINTS
from domain.enums import RiskLevel
from domain.geometry import simplify_polyline
from planner.trip_planner import PlanResult

__all__ = ["present_plan"]


def _format_utc_iso(dt: datetime) -> str:
    """Format datetime as UTC ISO-8601 string ending with 'Z'."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def present_plan(plan: PlanResult) -> dict[str, Any]:
    """Convert domain PlanResult into exact Section 15.3 JSON dictionary.

    Args:
        plan: PlanResult containing calculated routes, recommendation, heatmap, and notices.

    Returns:
        JSON-serializable dictionary matching Section 15.3 contract.
    """
    # 1. Format input block
    origin_in = plan.input_data.get("origin", {})
    dest_in = plan.input_data.get("destination", {})

    input_payload = {
        "origin": {
            "label": str(origin_in.get("label", "")),
            "lat": round(float(origin_in["lat"]), 5),
            "lng": round(float(origin_in["lng"]), 5),
        },
        "destination": {
            "label": str(dest_in.get("label", "")),
            "lat": round(float(dest_in["lat"]), 5),
            "lng": round(float(dest_in["lng"]), 5),
        },
        "departure_utc": str(plan.input_data["departure_utc"]),
        "load_weight_lb": int(plan.input_data["load_weight_lb"]),
        "checkpoint_interval_miles": plan.input_data["checkpoint_interval_miles"],
    }

    # 2. Format settings block
    settings_payload = {
        "delay_buffer": round(float(plan.settings.get("delay_buffer", 1.10)), 2),
        "heatmap_interval_miles": plan.settings.get("heatmap_interval_miles", 25),
        "truck_tare_lb": int(plan.settings.get("truck_tare_lb", 32000)),
    }

    # 3. Format routes block (ordered by rank)
    routes_payload: list[dict[str, Any]] = []
    for rd in plan.routes:
        summary = rd.summary
        # Ensure all 5 RiskLevels are present
        miles_by_lvl = {
            lvl.name: round(summary.miles_by_level.get(lvl, 0.0), 1)
            for lvl in RiskLevel
        }

        # Simplify route geometry for display
        simplified_pts = simplify_polyline(rd.route.points, DISPLAY_GEOMETRY_MAX_POINTS)
        # GeoJSON standard: [longitude, latitude]
        geojson_coords = [
            [round(p.lng, 5), round(p.lat, 5)]
            for p in simplified_pts
        ]

        checkpoints_payload: list[dict[str, Any]] = []
        for cpd in rd.checkpoints:
            cp = cpd.checkpoint
            wx = cpd.weather
            rk = cpd.risk
            checkpoints_payload.append({
                "index": int(cp.index),
                "mile": round(cp.mile, 2),
                "lat": round(cp.position.lat, 5),
                "lng": round(cp.position.lng, 5),
                "segment_miles": round(cp.segment_miles, 2),
                "eta_utc": _format_utc_iso(cp.eta_utc),
                "forecast_hour_utc": _format_utc_iso(cp.forecast_hour_utc),
                "weather": {
                    "wind_mph": round(wx.wind_mph, 2),
                    "wind_gust_mph": round(wx.wind_gust_mph, 2),
                    "rain_in_hr": round(wx.rain_in_hr, 2),
                    "snow_in_hr": round(wx.snow_in_hr, 2),
                },
                "risk": {
                    "level": rk.level.name,
                    "wind_level": rk.wind_level.name,
                    "rain_level": rk.rain_level.name,
                    "snow_level": rk.snow_level.name,
                    "driver": rk.driver.value,
                    "load_rule": rk.load_rule,
                },
            })

        routes_payload.append({
            "id": rd.route.route_id,
            "label": rd.label,
            "rank": int(rd.rank),
            "is_recommended": bool(rd.is_recommended),
            "summary": {
                "distance_miles": round(summary.distance_miles, 1),
                "base_duration_s": int(round(summary.base_duration_s)),
                "buffered_duration_s": int(round(summary.buffered_duration_s)),
                "departure_utc": _format_utc_iso(summary.departure_utc),
                "arrival_utc": _format_utc_iso(summary.arrival_utc),
                "avg_risk": round(summary.avg_risk, 2),
                "max_level": summary.max_level.name,
                "miles_by_level": miles_by_lvl,
            },
            "geometry": {
                "type": "LineString",
                "coordinates": geojson_coords,
            },
            "checkpoints": checkpoints_payload,
        })

    # 4. Format recommendation block
    rec = plan.recommendation
    ranking_items_payload = [
        {
            "route_id": item.route_id,
            "key": [
                round(item.key[0], 1),
                round(item.key[1], 1),
                round(item.key[2], 1),
                round(item.key[3], 2),
                int(item.key[4]),
            ],
        }
        for item in rec.ranking
    ]

    recommendation_payload = {
        "route_id": rec.recommended_route_id,
        "status": rec.status,
        "reasons": list(rec.reasons),
        "ranking": ranking_items_payload,
    }

    # 5. Format heatmap block
    hm = plan.heatmap
    heatmap_points_payload = [
        {
            "lat": round(hp.lat, 2),
            "lng": round(hp.lng, 2),
            "risk": [int(x) for x in hp.risk],
            "wind_mph": [round(float(x), 1) for x in hp.wind_mph],
            "rain_in_hr": [round(float(x), 2) for x in hp.rain_in_hr],
            "snow_in_hr": [round(float(x), 2) for x in hp.snow_in_hr],
        }
        for hp in hm.points
    ]

    heatmap_payload = {
        "start_utc": _format_utc_iso(hm.start_utc),
        "hours": int(hm.hours),
        "truncated": bool(hm.truncated),
        "points": heatmap_points_payload,
    }

    # 6. Format notices block
    notices_payload = [
        {"code": n["code"], "message": n["message"]}
        for n in plan.notices
    ]

    return {
        "request_id": plan.request_id,
        "generated_at_utc": _format_utc_iso(plan.generated_at_utc),
        "input": input_payload,
        "settings": settings_payload,
        "routes": routes_payload,
        "recommendation": recommendation_payload,
        "heatmap": heatmap_payload,
        "notices": notices_payload,
    }
