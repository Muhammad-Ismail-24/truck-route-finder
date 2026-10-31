"""HERE Routing API v8 client for truck routing.

Implements Section 11.2 and Decisions D-12, D-23, D-24 of ARCHITECTURE.md:
  - Fetches up to 3 truck routes via GET https://router.hereapi.com/v8/routes
  - Params: transportMode=truck, origin, destination, departureTime, alternatives=2,
    return=polyline,summary, vehicle[grossWeight]={kg int}, apiKey=...
  - Gross weight: min(load_weight_lb + TRUCK_TARE_LB, 80_000) converted to kg (D-24).
  - Concatenates section polylines, drops duplicate join points, drops consecutive duplicates.
  - Decodes with flexpolyline.decode.
  - Maps to route-1..route-3 in HERE order.
  - Zero routes returned -> raises NoRouteFound.
"""

import os
from datetime import datetime, timezone
from typing import Any

import flexpolyline
import httpx

from clients.http import NoRouteFound, UpstreamError, create_client
from domain.models import LatLng, RouteGeometry

HERE_ROUTES_URL: str = "https://router.hereapi.com/v8/routes"
METERS_PER_MILE: float = 1609.344
LB_TO_KG: float = 0.45359237
TRUCK_TARE_LB: int = 32_000
MAX_GROSS_WEIGHT_LB: int = 80_000


def _format_coord(point: Any) -> str:
    """Format LatLng, (lat, lng) tuple, or coordinate dict to '{lat},{lng}' string."""
    if isinstance(point, LatLng):
        return f"{point.lat},{point.lng}"
    if isinstance(point, (tuple, list)) and len(point) >= 2:
        return f"{point[0]},{point[1]}"
    if isinstance(point, dict) and "lat" in point and "lng" in point:
        return f"{point['lat']},{point['lng']}"
    if hasattr(point, "lat") and hasattr(point, "lng"):
        return f"{point.lat},{point.lng}"
    raise ValueError(f"Unsupported coordinate format: {point!r}")


def _format_departure_time(departure_utc: datetime | str) -> str:
    """Format departure time as ISO-8601 UTC string (e.g. '2026-11-02T13:00:00Z')."""
    if isinstance(departure_utc, str):
        return departure_utc
    if departure_utc.tzinfo is None:
        departure_utc = departure_utc.replace(tzinfo=timezone.utc)
    else:
        departure_utc = departure_utc.astimezone(timezone.utc)
    return departure_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def _get_api_key(override_key: str | None = None) -> str:
    """Retrieve HERE API key from argument, Django settings, or environment variable."""
    if override_key:
        return override_key
    try:
        from django.conf import settings

        if settings.configured and hasattr(settings, "HERE_API_KEY") and settings.HERE_API_KEY:
            return str(settings.HERE_API_KEY)
    except ImportError:
        pass
    return os.environ.get("HERE_API_KEY", "")


def compute_gross_weight_kg(load_weight_lb: int) -> int:
    """Compute truck gross weight in kilograms capped at 80,000 lb (D-24)."""
    gross_lb = min(load_weight_lb + TRUCK_TARE_LB, MAX_GROSS_WEIGHT_LB)
    return int(round(gross_lb * LB_TO_KG))


def fetch_truck_routes(
    origin: Any,
    destination: Any,
    departure_utc: datetime | str,
    load_weight_lb: int,
    client: httpx.Client | None = None,
    api_key: str | None = None,
) -> list[RouteGeometry]:
    """Fetch up to 3 truck routes from HERE Routing API v8.

    Args:
        origin: Origin coordinate (LatLng, tuple, or dict).
        destination: Destination coordinate (LatLng, tuple, or dict).
        departure_utc: Departure time (datetime or ISO-8601 string).
        load_weight_lb: Cargo weight in pounds.
        client: Optional shared httpx.Client (creates one if omitted).
        api_key: Optional HERE API key override (falls back to settings/env).

    Returns:
        List of RouteGeometry objects labeled route-1..route-3 in HERE order.

    Raises:
        NoRouteFound: If HERE returns zero routes.
        UpstreamError: If HERE returns an HTTP error status code.
    """
    key = _get_api_key(api_key)
    origin_str = _format_coord(origin)
    dest_str = _format_coord(destination)
    departure_str = _format_departure_time(departure_utc)
    gross_kg = compute_gross_weight_kg(load_weight_lb)

    params: dict[str, str] = {
        "transportMode": "truck",
        "origin": origin_str,
        "destination": dest_str,
        "departureTime": departure_str,
        "alternatives": "2",
        "return": "polyline,summary",
        "vehicle[grossWeight]": str(gross_kg),
        "apiKey": key,
    }

    should_close = client is None
    http_client = client if client is not None else create_client()

    try:
        response = http_client.get(HERE_ROUTES_URL, params=params)
    finally:
        if should_close:
            http_client.close()

    if response.status_code != 200:
        raise UpstreamError("here_routing", response.status_code, response.text)

    try:
        data = response.json()
    except Exception as exc:
        raise UpstreamError(
            "here_routing",
            response.status_code,
            f"Invalid JSON response: {exc}",
        ) from exc

    raw_routes = data.get("routes", [])
    if not raw_routes:
        raise NoRouteFound("No truck route found between these points.")

    # Section 18: If HERE returns >3 routes, take first 3
    routes_to_process = raw_routes[:3]
    result: list[RouteGeometry] = []

    for idx, route in enumerate(routes_to_process):
        route_id = f"route-{idx + 1}"
        route_points: list[LatLng] = []
        total_length_m = 0.0
        total_duration_s = 0.0

        for section in route.get("sections", []):
            summary = section.get("summary", {})
            total_length_m += float(summary.get("length", 0.0))
            total_duration_s += float(summary.get("duration", 0.0))

            encoded_poly = section.get("polyline")
            if not encoded_poly:
                continue

            decoded_pts = flexpolyline.decode(encoded_poly)
            for pt in decoded_pts:
                lat = float(pt[0])
                lng = float(pt[1])
                # Drop consecutive duplicates (including duplicate section join points)
                if route_points:
                    prev = route_points[-1]
                    if abs(prev.lat - lat) <= 1e-7 and abs(prev.lng - lng) <= 1e-7:
                        continue
                route_points.append(LatLng(lat=lat, lng=lng))

        distance_mi = total_length_m / METERS_PER_MILE
        result.append(
            RouteGeometry(
                route_id=route_id,
                points=tuple(route_points),
                distance_mi=distance_mi,
                base_duration_s=total_duration_s,
            )
        )

    return result
