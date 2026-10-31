"""Checkpoint sampling along routes for Spotter Truck Routing.

Implements Section 10.2 of ARCHITECTURE.md:
  - build_checkpoints: samples route at selected interval (D-01).
  - Checkpoint miles at 0, I, 2I... while < total, plus destination at total.
  - Short routes (< interval) yield exactly 2 checkpoints (0 and total).
  - Segment ownership centered on checkpoints (D-06).
  - Invariant: sum(segment_miles) == total within 1e-6.
"""

from datetime import datetime

from domain.eta import compute_eta, nearest_forecast_hour
from domain.geometry import cumulative_miles, point_at_mile
from domain.models import Checkpoint, RouteGeometry


def build_checkpoints(
    route: RouteGeometry,
    interval_miles: float,
    departure_utc: datetime,
    buffered_duration_s: float,
) -> list[Checkpoint]:
    """Sample checkpoints along a route at the chosen interval (D-01, D-06)."""
    cum = cumulative_miles(route.points)
    if not cum:
        return []

    # Use computed cumulative total as authority for miles (Section 10.2 item 1)
    total = cum[-1]

    if len(cum) == 1 or total <= 1e-6:
        eta = departure_utc
        f_hour = nearest_forecast_hour(eta)
        return [
            Checkpoint(
                index=0,
                mile=0.0,
                position=route.points[0],
                segment_miles=0.0,
                eta_utc=eta,
                forecast_hour_utc=f_hour,
            )
        ]

    # Checkpoint miles: 0, I, 2I, ... while < total, then always total
    # If total < interval, yields [0.0, total] (exactly 2 checkpoints)
    checkpoint_miles: list[float] = [0.0]
    current = float(interval_miles)
    while current < total - 1e-6:
        checkpoint_miles.append(current)
        current += float(interval_miles)
    checkpoint_miles.append(total)

    n = len(checkpoint_miles)

    # Segment ownership (D-06):
    # lower[i] = 0 if i == 0 else (m[i-1] + m[i]) / 2
    # upper[i] = total if i == n-1 else (m[i] + m[i+1]) / 2
    # segment_miles[i] = upper[i] - lower[i]
    segment_miles: list[float] = []
    for i in range(n):
        lower = 0.0 if i == 0 else (checkpoint_miles[i - 1] + checkpoint_miles[i]) / 2.0
        upper = total if i == n - 1 else (checkpoint_miles[i] + checkpoint_miles[i + 1]) / 2.0
        segment_miles.append(upper - lower)

    # Build checkpoints
    checkpoints: list[Checkpoint] = []
    for i, mile in enumerate(checkpoint_miles):
        pos = point_at_mile(route.points, cum, mile)
        eta = compute_eta(departure_utc, mile, total, buffered_duration_s)
        f_hour = nearest_forecast_hour(eta)
        checkpoints.append(
            Checkpoint(
                index=i,
                mile=mile,
                position=pos,
                segment_miles=segment_miles[i],
                eta_utc=eta,
                forecast_hour_utc=f_hour,
            )
        )

    return checkpoints
