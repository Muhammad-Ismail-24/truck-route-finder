"""Tests for domain/geometry.py.

Covers:
  - haversine_mi: known city-to-city distances within 0.5%, symmetry, zero-distance
  - cumulative_miles: zero start, monotonic, empty & single-point handling
  - point_at_mile: exact vertices, mid-segment interpolation, boundary clamping (<0, >total)
  - simplify_polyline: Douglas-Peucker keeping endpoints, respecting max_points,
                       2-point and duplicate-point inputs
"""

import math

import pytest

from domain.geometry import (
    EARTH_RADIUS_MI,
    cumulative_miles,
    haversine_mi,
    point_at_mile,
    simplify_polyline,
)
from domain.models import LatLng

# ---------------------------------------------------------------------------
# Known locations
# ---------------------------------------------------------------------------
NYC = LatLng(lat=40.7128, lng=-74.0060)
LA = LatLng(lat=34.0522, lng=-118.2437)
CHICAGO = LatLng(lat=41.8781, lng=-87.6298)
DENVER = LatLng(lat=39.7392, lng=-104.9903)


# ---------------------------------------------------------------------------
# 1. Haversine tests
# ---------------------------------------------------------------------------

class TestHaversine:
    def test_earth_radius_constant(self):
        """Earth radius must match ARCHITECTURE.md Section 10.1 (3958.7613 mi)."""
        assert math.isclose(EARTH_RADIUS_MI, 3958.7613, rel_tol=1e-6)

    def test_distance_to_self_is_zero(self):
        assert haversine_mi(CHICAGO, CHICAGO) == 0.0
        assert haversine_mi(NYC, NYC) == 0.0

    def test_distance_is_symmetric(self):
        d1 = haversine_mi(CHICAGO, DENVER)
        d2 = haversine_mi(DENVER, CHICAGO)
        assert math.isclose(d1, d2, rel_tol=1e-9)

    def test_known_distance_chicago_to_denver_within_half_percent(self):
        """Chicago to Denver great-circle distance is ~918.5 miles."""
        d = haversine_mi(CHICAGO, DENVER)
        expected = 918.5
        assert math.isclose(d, expected, rel_tol=0.005)

    def test_known_distance_nyc_to_la_within_half_percent(self):
        """NYC to LA great-circle distance is ~2445.5 miles."""
        d = haversine_mi(NYC, LA)
        expected = 2445.5
        assert math.isclose(d, expected, rel_tol=0.005)


# ---------------------------------------------------------------------------
# 2. Cumulative miles tests
# ---------------------------------------------------------------------------

class TestCumulativeMiles:
    def test_empty_points(self):
        assert cumulative_miles([]) == []

    def test_single_point(self):
        assert cumulative_miles([CHICAGO]) == [0.0]

    def test_two_points(self):
        cum = cumulative_miles([CHICAGO, DENVER])
        assert len(cum) == 2
        assert cum[0] == 0.0
        assert math.isclose(cum[1], haversine_mi(CHICAGO, DENVER), rel_tol=1e-9)

    def test_three_points_monotonic_sum(self):
        points = [NYC, CHICAGO, DENVER]
        cum = cumulative_miles(points)
        assert len(cum) == 3
        assert cum[0] == 0.0
        assert math.isclose(cum[1], haversine_mi(NYC, CHICAGO), rel_tol=1e-9)
        assert math.isclose(
            cum[2],
            haversine_mi(NYC, CHICAGO) + haversine_mi(CHICAGO, DENVER),
            rel_tol=1e-9,
        )
        assert cum[0] <= cum[1] <= cum[2]


# ---------------------------------------------------------------------------
# 3. Point at mile (interpolation & clamping)
# ---------------------------------------------------------------------------

class TestPointAtMile:
    def setup_method(self):
        self.points = [
            LatLng(lat=40.0, lng=-100.0),
            LatLng(lat=41.0, lng=-99.0),
            LatLng(lat=42.0, lng=-98.0),
        ]
        self.cum = cumulative_miles(self.points)

    def test_exact_vertices(self):
        """Querying at exact cumulative mile returns exact vertex coordinates."""
        for pt, mile in zip(self.points, self.cum, strict=True):
            res = point_at_mile(self.points, self.cum, mile)
            assert math.isclose(res.lat, pt.lat, abs_tol=1e-6)
            assert math.isclose(res.lng, pt.lng, abs_tol=1e-6)

    def test_mid_segment_interpolation(self):
        """Interpolating halfway between two points yields exact midpoint."""
        p0 = LatLng(lat=10.0, lng=20.0)
        p1 = LatLng(lat=20.0, lng=40.0)
        pts = [p0, p1]
        cum = [0.0, 100.0]
        mid = point_at_mile(pts, cum, 50.0)
        assert math.isclose(mid.lat, 15.0, abs_tol=1e-6)
        assert math.isclose(mid.lng, 30.0, abs_tol=1e-6)

    def test_quarter_segment_interpolation(self):
        p0 = LatLng(lat=0.0, lng=0.0)
        p1 = LatLng(lat=10.0, lng=20.0)
        pts = [p0, p1]
        cum = [0.0, 100.0]
        res = point_at_mile(pts, cum, 25.0)
        assert math.isclose(res.lat, 2.5, abs_tol=1e-6)
        assert math.isclose(res.lng, 5.0, abs_tol=1e-6)

    def test_clamps_negative_mile_to_first_point(self):
        res = point_at_mile(self.points, self.cum, -10.0)
        assert math.isclose(res.lat, self.points[0].lat, abs_tol=1e-6)
        assert math.isclose(res.lng, self.points[0].lng, abs_tol=1e-6)

    def test_clamps_beyond_total_mile_to_last_point(self):
        total = self.cum[-1]
        res = point_at_mile(self.points, self.cum, total + 50.0)
        assert math.isclose(res.lat, self.points[-1].lat, abs_tol=1e-6)
        assert math.isclose(res.lng, self.points[-1].lng, abs_tol=1e-6)

    def test_single_point_returns_that_point(self):
        res = point_at_mile([CHICAGO], [0.0], 100.0)
        assert res == CHICAGO

    def test_empty_points_raises_value_error(self):
        with pytest.raises(ValueError, match="empty"):
            point_at_mile([], [], 10.0)


# ---------------------------------------------------------------------------
# 4. Simplify polyline (Douglas-Peucker)
# ---------------------------------------------------------------------------

class TestSimplifyPolyline:
    def test_two_point_input(self):
        """2-point polyline is always preserved unchanged."""
        pts = [CHICAGO, DENVER]
        res = simplify_polyline(pts, max_points=10)
        assert res == pts

    def test_already_simpler_than_max_points(self):
        pts = [NYC, CHICAGO, DENVER]
        res = simplify_polyline(pts, max_points=5)
        assert res == pts

    def test_keeps_endpoints(self):
        """Endpoints (first and last point) must always be preserved."""
        # Collinear and non-collinear points
        pts = [
            LatLng(lat=40.0 + i * 0.1, lng=-100.0 + (i % 3) * 0.05)
            for i in range(50)
        ]
        res = simplify_polyline(pts, max_points=10)
        assert res[0] == pts[0]
        assert res[-1] == pts[-1]
        assert len(res) <= 10

    def test_respects_max_points_constraint(self):
        """Result length must never exceed max_points."""
        # Wavy polyline with 100 points
        pts = [
            LatLng(lat=30.0 + i * 0.1, lng=-90.0 + math.sin(i / 5.0) * 0.5)
            for i in range(100)
        ]
        for limit in (3, 5, 10, 25, 50):
            res = simplify_polyline(pts, max_points=limit)
            assert len(res) <= limit
            assert res[0] == pts[0]
            assert res[-1] == pts[-1]

    def test_perfectly_straight_line_simplifies_to_endpoints(self):
        """Points along a straight line simplify down to 2 endpoints."""
        pts = [
            LatLng(lat=10.0 + i * 1.0, lng=20.0 + i * 2.0)
            for i in range(20)
        ]
        res = simplify_polyline(pts, max_points=5)
        assert len(res) == 2
        assert res[0] == pts[0]
        assert res[-1] == pts[-1]

    def test_duplicate_points_handling(self):
        """Consecutive or repeated duplicate points are handled cleanly."""
        pts = [CHICAGO, CHICAGO, CHICAGO, DENVER, DENVER]
        res = simplify_polyline(pts, max_points=5)
        assert len(res) <= 5
        assert res[0] == CHICAGO
        assert res[-1] == DENVER

    def test_identical_all_points(self):
        """Polyline where every point is the same coordinate."""
        pts = [CHICAGO, CHICAGO, CHICAGO]
        res = simplify_polyline(pts, max_points=5)
        assert res[0] == CHICAGO
        assert res[-1] == CHICAGO
        assert len(res) <= 5
