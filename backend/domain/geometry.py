"""Pure-Python geometric calculations for Spotter Truck Routing.

Implements Section 10.1 of ARCHITECTURE.md:
  - haversine_mi: Great-circle distance using Earth radius 3958.7613 mi.
  - cumulative_miles: Cumulative mileage array along a polyline.
  - point_at_mile: Linear interpolation at arbitrary route mileage via bisect.
  - simplify_polyline: Iterative Douglas-Peucker simplification for display.

No numpy, no shapely, no external I/O or frameworks.
"""

import bisect
import math
from collections.abc import Sequence

from domain.models import LatLng

# Earth radius in miles per ARCHITECTURE.md Section 10.1
EARTH_RADIUS_MI: float = 3958.7613


def haversine_mi(a: LatLng, b: LatLng) -> float:
    """Compute great-circle distance between two points in miles."""
    lat1 = math.radians(a.lat)
    lat2 = math.radians(b.lat)
    dlat = math.radians(b.lat - a.lat)
    dlng = math.radians(b.lng - a.lng)

    h = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2.0) ** 2
    h = min(1.0, max(0.0, h))
    c = 2.0 * math.asin(math.sqrt(h))
    return EARTH_RADIUS_MI * c


def cumulative_miles(points: Sequence[LatLng]) -> list[float]:
    """Calculate cumulative mileage along a polyline, starting at 0.0."""
    if not points:
        return []
    cum = [0.0]
    for i in range(1, len(points)):
        cum.append(cum[-1] + haversine_mi(points[i - 1], points[i]))
    return cum


def point_at_mile(
    points: Sequence[LatLng],
    cumulative: Sequence[float],
    mile: float,
) -> LatLng:
    """Interpolate coordinates at a specific mile along a polyline using bisect."""
    if not points:
        raise ValueError("points sequence cannot be empty")
    if len(points) == 1:
        return points[0]
    if mile <= 0.0 or mile <= cumulative[0]:
        return points[0]
    if mile >= cumulative[-1]:
        return points[-1]

    idx = bisect.bisect_right(cumulative, mile)
    m0 = cumulative[idx - 1]
    m1 = cumulative[idx]
    p0 = points[idx - 1]
    p1 = points[idx]

    span = m1 - m0
    if span <= 1e-12:
        return p0

    fraction = (mile - m0) / span
    lat = p0.lat + fraction * (p1.lat - p0.lat)
    lng = p0.lng + fraction * (p1.lng - p0.lng)
    return LatLng(lat=lat, lng=lng)


def _rdp_indices(coords: list[tuple[float, float]], epsilon: float) -> list[int]:
    """Iterative Ramer-Douglas-Peucker returning indices of kept points."""
    n = len(coords)
    if n <= 2:
        return list(range(n))

    keep = [False] * n
    keep[0] = True
    keep[n - 1] = True

    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue

        x1, y1 = coords[start]
        x2, y2 = coords[end]
        dx = x2 - x1
        dy = y2 - y1
        seg_len = math.hypot(dx, dy)

        max_dist = -1.0
        max_idx = start

        for i in range(start + 1, end):
            x0, y0 = coords[i]
            if seg_len < 1e-9:
                dist = math.hypot(x0 - x1, y0 - y1)
            else:
                dist = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / seg_len
            if dist > max_dist:
                max_dist = dist
                max_idx = i

        if max_dist > epsilon:
            keep[max_idx] = True
            stack.append((start, max_idx))
            stack.append((max_idx, end))

    return [i for i, k in enumerate(keep) if k]


def simplify_polyline(points: Sequence[LatLng], max_points: int) -> list[LatLng]:
    """Simplify polyline via Douglas-Peucker until point count <= max_points."""
    if len(points) <= max_points or len(points) <= 2:
        return list(points)

    target_max = max(2, max_points)

    # Project lat/lng to planar coordinates (in miles) around mean latitude
    lat_ref_rad = math.radians(points[0].lat)
    cos_lat = math.cos(lat_ref_rad)
    rad_factor = math.pi / 180.0

    coords: list[tuple[float, float]] = [
        (
            p.lng * rad_factor * EARTH_RADIUS_MI * cos_lat,
            p.lat * rad_factor * EARTH_RADIUS_MI,
        )
        for p in points
    ]

    epsilon = 0.001  # Start with 0.001 miles (~5 ft) tolerance
    while True:
        indices = _rdp_indices(coords, epsilon)
        if len(indices) <= target_max:
            return [points[i] for i in indices]
        epsilon *= 1.5
