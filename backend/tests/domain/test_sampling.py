"""Tests for domain/sampling.py.

Covers:
  - Checkpoint miles sequence (0, I, 2I... while < total, plus always destination)
  - Short routes (< interval) yielding exactly 2 checkpoints (start and destination)
  - Segment ownership midpoint-to-midpoint (D-06)
  - Segment miles sum invariant: sum(segment_miles) == total within 1e-6
    for intervals 10, 25, 50, and odd/fractional totals
"""

import math
from datetime import datetime, timezone

from domain.geometry import cumulative_miles
from domain.models import LatLng, RouteGeometry
from domain.sampling import build_checkpoints

UTC = timezone.utc


def make_route(total_miles: float, num_points: int = 10) -> RouteGeometry:
    """Generate a straight synthetic RouteGeometry along a meridian of exactly total_miles."""
    # Along a meridian, distance is exactly delta_lat * (pi * R / 180)
    mi_per_deg = (math.pi * 3958.7613) / 180.0
    delta_lat = total_miles / mi_per_deg
    start_lat = 40.0
    lng = -100.0
    pts = tuple(
        LatLng(lat=start_lat + (i / (num_points - 1)) * delta_lat, lng=lng)
        for i in range(num_points)
    )
    actual_miles = cumulative_miles(pts)[-1]
    return RouteGeometry(
        route_id="route-1",
        points=pts,
        distance_mi=actual_miles,
        base_duration_s=3600.0 * (actual_miles / 50.0),  # 50 mph
    )


class TestBuildCheckpointsSpacing:
    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 8, 0, 0, tzinfo=UTC)

    def test_short_route_under_interval_yields_exactly_two_checkpoints(self):
        """When total < interval, checkpoints are strictly 0 and total (len=2)."""
        route = make_route(total_miles=15.0)
        total = cumulative_miles(route.points)[-1]
        cps = build_checkpoints(
            route=route,
            interval_miles=25,
            departure_utc=self.departure,
            buffered_duration_s=1800.0,
        )
        assert len(cps) == 2
        assert cps[0].index == 0
        assert cps[0].mile == 0.0
        assert math.isclose(cps[1].mile, total, abs_tol=1e-6)
        assert cps[1].index == 1

    def test_short_route_for_10_and_50_mile_intervals(self):
        route_5mi = make_route(total_miles=5.0)
        cps_10 = build_checkpoints(route_5mi, 10, self.departure, 600.0)
        assert len(cps_10) == 2

        route_30mi = make_route(total_miles=30.0)
        cps_50 = build_checkpoints(route_30mi, 50, self.departure, 3600.0)
        assert len(cps_50) == 2

    def test_regular_interval_placement(self):
        """For total=60 and interval=25, checkpoint miles are 0, 25, 50, 60."""
        route = make_route(total_miles=60.0)
        total = cumulative_miles(route.points)[-1]
        cps = build_checkpoints(route, 25, self.departure, 3600.0)
        assert len(cps) == 4
        assert cps[0].mile == 0.0
        assert math.isclose(cps[1].mile, 25.0, abs_tol=1e-4)
        assert math.isclose(cps[2].mile, 50.0, abs_tol=1e-4)
        assert math.isclose(cps[3].mile, total, abs_tol=1e-4)

    def test_exact_multiple_interval_placement(self):
        """For total=50 and interval=25, checkpoint miles are 0, 25, 50 (3 checkpoints)."""
        route = make_route(total_miles=50.0)
        total = cumulative_miles(route.points)[-1]
        cps = build_checkpoints(route, 25, self.departure, 3600.0)
        assert len(cps) == 3
        assert cps[0].mile == 0.0
        assert math.isclose(cps[1].mile, 25.0, abs_tol=1e-4)
        assert math.isclose(cps[2].mile, total, abs_tol=1e-4)


class TestSegmentOwnershipInvariant:
    """Midpoint-to-midpoint ownership (D-06). Invariant: sum(segment_miles) == total."""

    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 8, 0, 0, tzinfo=UTC)

    def test_two_checkpoints_segment_ownership(self):
        """When 2 checkpoints exist at 0 and total:
        cp0 owns [0, total/2] -> segment = total/2
        cp1 owns [total/2, total] -> segment = total/2.
        """
        route = make_route(total_miles=15.0)
        total = cumulative_miles(route.points)[-1]
        cps = build_checkpoints(route, 25, self.departure, 1800.0)
        assert math.isclose(cps[0].segment_miles, total / 2.0, abs_tol=1e-6)
        assert math.isclose(cps[1].segment_miles, total / 2.0, abs_tol=1e-6)
        assert math.isclose(sum(c.segment_miles for c in cps), total, abs_tol=1e-6)

    def test_sum_invariant_for_allowed_intervals(self):
        """Test invariant for standard intervals: 10, 25, 50 miles on a 210-mile route."""
        route = make_route(total_miles=210.0)
        total = cumulative_miles(route.points)[-1]
        for interval in (10, 25, 50):
            cps = build_checkpoints(route, interval, self.departure, 15000.0)
            seg_sum = sum(c.segment_miles for c in cps)
            assert math.isclose(seg_sum, total, abs_tol=1e-6)

    def test_sum_invariant_for_odd_and_fractional_totals(self):
        """Test invariant on odd and fractional lengths."""
        for distance in (7.3, 33.33, 137.49, 1243.81):
            route = make_route(total_miles=distance)
            total = cumulative_miles(route.points)[-1]
            for interval in (10, 25, 50):
                cps = build_checkpoints(route, interval, self.departure, 20000.0)
                seg_sum = sum(c.segment_miles for c in cps)
                assert math.isclose(seg_sum, total, abs_tol=1e-6)


class TestCheckpointFields:
    def test_indices_and_timestamps(self):
        route = make_route(total_miles=100.0)
        departure = datetime(2026, 11, 2, 8, 15, 0, tzinfo=UTC)
        duration_s = 7200.0  # 2 hours
        cps = build_checkpoints(route, 25, departure, duration_s)

        # Indices are 0, 1, 2, ...
        for i, cp in enumerate(cps):
            assert cp.index == i
            assert cp.eta_utc.tzinfo == UTC
            assert cp.forecast_hour_utc.tzinfo == UTC
            # Forecast hour has minute=0, second=0
            assert cp.forecast_hour_utc.minute == 0
            assert cp.forecast_hour_utc.second == 0

        # Start checkpoint
        assert cps[0].eta_utc == departure
        # End checkpoint (2 hours later)
        expected_arrival = datetime(2026, 11, 2, 10, 15, 0, tzinfo=UTC)
        assert cps[-1].eta_utc == expected_arrival
