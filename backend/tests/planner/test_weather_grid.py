"""Tests for backend/planner/weather_grid.py.

Covers:
  - grid_key(lat, lng) rounding to 2 decimals (~1.1 km) (Section 12.2)
  - weather_date_range across midnight and across 48 h (Section 12.2)
  - Heatmap point sampling every HEATMAP_INTERVAL_MILES (25) (Section 12.3)
  - Deduplication across overlapping routes (Section 12.2)
  - Heatmap thinning doubling interval and emitting notice HEATMAP_THINNED (Section 12.4)
  - Checkpoints are never thinned (Section 12.4)
"""

from datetime import date, datetime, timezone

from domain.constants import HEATMAP_INTERVAL_MILES
from domain.models import Checkpoint, LatLng, RouteGeometry
from planner.weather_grid import (
    NOTICE_HEATMAP_THINNED,
    WeatherGridResult,
    build_weather_grid,
    build_weather_points,
    grid_key,
    point_grid_key,
    sample_heatmap_points,
    sample_route_heatmap_points,
    thin_heatmap_points,
    weather_date_range,
)


class TestWeatherGridKey:
    """Verify coordinate rounding to 2 decimal places."""

    def test_grid_key_rounding(self):
        """grid_key rounds both latitude and longitude to 2 decimals."""
        assert grid_key(41.8781, -87.6298) == (41.88, -87.63)
        assert grid_key(39.7392, -104.9903) == (39.74, -104.99)
        assert grid_key(40.0, -90.0) == (40.0, -90.0)

    def test_point_grid_key_types(self):
        """point_grid_key extracts coordinates from LatLng, Checkpoint, tuple, dict."""
        pt = LatLng(lat=41.8781, lng=-87.6298)
        assert point_grid_key(pt) == (41.88, -87.63)

        cp = Checkpoint(
            index=0,
            mile=0.0,
            position=pt,
            segment_miles=12.5,
            eta_utc=datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc),
            forecast_hour_utc=datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc),
        )
        assert point_grid_key(cp) == (41.88, -87.63)

        assert point_grid_key((41.8781, -87.6298)) == (41.88, -87.63)
        assert point_grid_key({"lat": 41.8781, "lng": -87.6298}) == (41.88, -87.63)


class TestWeatherDateRange:
    """Verify start = floor_hour(dep), end = max(max_fh, dep+48h) (Section 12.2)."""

    def test_date_range_standard_48h_horizon(self):
        """Short trip (<48h) ends at departure_hour + 48h date."""
        dep = datetime(2026, 11, 2, 13, 45, tzinfo=timezone.utc)
        etas = [
            datetime(2026, 11, 2, 18, 0, tzinfo=timezone.utc),
            datetime(2026, 11, 3, 2, 0, tzinfo=timezone.utc),
        ]
        start, end = weather_date_range(dep, etas)
        # Floor 13:45 -> 13:00 on 2026-11-02
        assert start == date(2026, 11, 2)
        # 13:00 on 2026-11-02 + 48h = 13:00 on 2026-11-04
        assert end == date(2026, 11, 4)

    def test_date_range_across_midnight(self):
        """Departure late in the day (23:30) starts on same date; horizon is +48h."""
        dep = datetime(2026, 11, 2, 23, 30, tzinfo=timezone.utc)
        etas = [datetime(2026, 11, 3, 2, 0, tzinfo=timezone.utc)]
        start, end = weather_date_range(dep, etas)
        # Floor 23:30 -> 23:00 on 2026-11-02
        assert start == date(2026, 11, 2)
        # 23:00 on Nov 2 + 48h = 23:00 on Nov 4
        assert end == date(2026, 11, 4)

    def test_date_range_across_48h_trip(self):
        """Long trip (>48h) extends end_date to cover the latest forecast hour."""
        dep = datetime(2026, 11, 2, 8, 0, tzinfo=timezone.utc)
        # Arrival 60 hours later (2026-11-04 20:00)
        etas = [
            datetime(2026, 11, 4, 20, 0, tzinfo=timezone.utc),
        ]
        start, end = weather_date_range(dep, etas)
        assert start == date(2026, 11, 2)
        assert end == date(2026, 11, 4)

        # Arrival 74 hours later (2026-11-05 10:00)
        etas_long = [
            datetime(2026, 11, 5, 10, 0, tzinfo=timezone.utc),
        ]
        start_long, end_long = weather_date_range(dep, etas_long)
        assert start_long == date(2026, 11, 2)
        assert end_long == date(2026, 11, 5)

    def test_date_range_string_inputs_and_empty_etas(self):
        """Accepts ISO string timestamps and handles empty ETAs list gracefully."""
        dep_str = "2026-11-02T13:00:00Z"
        start, end = weather_date_range(dep_str, all_etas=[])
        assert start == date(2026, 11, 2)
        assert end == date(2026, 11, 4)


class TestHeatmapSamplingAndDeduplication:
    """Verify heatmap sampling every 25 mi and deduplication across overlapping routes."""

    def _make_dummy_route(
        self,
        route_id: str,
        start_lat: float,
        end_lat: float,
        lng: float = -87.63,
    ) -> RouteGeometry:
        # Straight north-south route
        pts = (
            LatLng(lat=start_lat, lng=lng),
            LatLng(lat=(start_lat + end_lat) / 2.0, lng=lng),
            LatLng(lat=end_lat, lng=lng),
        )
        return RouteGeometry(
            route_id=route_id,
            points=pts,
            distance_mi=70.0,
            base_duration_s=4000.0,
        )

    def test_sample_route_heatmap_points_includes_destination(self):
        """sample_route_heatmap_points includes 0, interval steps, and destination."""
        route = self._make_dummy_route("r1", 40.0, 41.0)
        # 1 degree lat is ~69 miles
        points = sample_route_heatmap_points(route, interval_miles=25.0)
        # Expect miles 0, 25, 50, and 69.x (destination) -> 4 points
        assert len(points) == 4
        assert points[0] == route.points[0]
        assert points[-1] == route.points[-1]

    def test_deduplication_across_overlapping_routes(self):
        """Points and checkpoints on shared corridors are deduplicated into unique grid keys."""
        # Route 1 and Route 2 share the same initial 50-mile segment
        route1 = self._make_dummy_route("r1", 40.0, 41.0, lng=-87.63)
        route2 = self._make_dummy_route("r2", 40.0, 41.0, lng=-87.63)  # Exact overlap

        cp1 = Checkpoint(
            index=0,
            mile=0.0,
            position=LatLng(lat=40.0, lng=-87.63),
            segment_miles=12.5,
            eta_utc=datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc),
            forecast_hour_utc=datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc),
        )
        cp2 = Checkpoint(
            index=0,
            mile=0.0,
            position=LatLng(lat=40.0, lng=-87.63),
            segment_miles=12.5,
            eta_utc=datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc),
            forecast_hour_utc=datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc),
        )

        checkpoints_by_route = {"r1": [cp1], "r2": [cp2]}
        weather_keys = build_weather_points(
            routes=[route1, route2],
            checkpoints_by_route=checkpoints_by_route,
        )

        # No duplicate grid keys exist in weather_keys
        assert len(weather_keys) == len(set(weather_keys))
        # Start point is present exactly once
        assert weather_keys.count((40.0, -87.63)) == 1

    def test_sample_heatmap_points_unions_routes(self):
        """sample_heatmap_points dedupes across all routes."""
        r1 = self._make_dummy_route("r1", 40.0, 41.0, lng=-87.63)
        r2 = self._make_dummy_route("r2", 40.0, 41.0, lng=-87.63)
        pts = sample_heatmap_points([r1, r2], interval_miles=25.0)
        grid_keys = [grid_key(p.lat, p.lng) for p in pts]
        assert len(grid_keys) == len(set(grid_keys))


class TestHeatmapThinning:
    """Verify Section 12.4 thinning: doubles interval until under cap, never thins checkpoints."""

    def _make_long_route(self) -> RouteGeometry:
        # Create a route with ~300 miles
        pts = tuple(LatLng(lat=30.0 + i * 0.1, lng=-90.0) for i in range(50))
        return RouteGeometry(
            route_id="route-long",
            points=pts,
            distance_mi=300.0,
            base_duration_s=18000.0,
        )

    def test_thin_heatmap_points_direct(self):
        """thin_heatmap_points doubles interval and returns thinned points."""
        route = self._make_long_route()
        pts, interval, thinned = thin_heatmap_points(
            routes=[route],
            checkpoint_keys=set(),
            initial_interval=HEATMAP_INTERVAL_MILES,
            max_unique_points=4,
        )
        assert thinned is True
        assert interval > HEATMAP_INTERVAL_MILES
        assert len(pts) <= 4

    def test_thinning_triggers_when_heatmap_only_points_exceed_cap(self):
        """When heatmap-only points > cap, interval doubles and HEATMAP_THINNED is emitted."""
        route = self._make_long_route()
        cp = Checkpoint(
            index=0,
            mile=0.0,
            position=route.points[0],
            segment_miles=12.5,
            eta_utc=datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc),
            forecast_hour_utc=datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc),
        )

        # Set max_unique_points to 4 so 300mi / 25mi (~13 points) exceeds cap
        grid_result = build_weather_grid(
            routes=[route],
            checkpoints_by_route=[[cp]],
            initial_interval=HEATMAP_INTERVAL_MILES,
            max_unique_points=4,
        )

        assert isinstance(grid_result, WeatherGridResult)
        assert grid_result.heatmap_thinned is True
        assert grid_result.heatmap_interval_miles > HEATMAP_INTERVAL_MILES
        # 25 -> 50 -> 100 -> interval doubled to reduce points under cap
        assert grid_result.notice == NOTICE_HEATMAP_THINNED
        assert grid_result.notice["code"] == "HEATMAP_THINNED"

    def test_checkpoints_are_never_thinned(self):
        """Checkpoints are never thinned (Section 12.4), even when heatmap is thinned."""
        route = self._make_long_route()
        # Create 10 distinct checkpoints along the route
        checkpoints: list[Checkpoint] = []
        for i in range(10):
            pt = LatLng(lat=30.0 + i * 0.2, lng=-90.0)
            checkpoints.append(
                Checkpoint(
                    index=i,
                    mile=i * 25.0,
                    position=pt,
                    segment_miles=25.0,
                    eta_utc=datetime(2026, 11, 2, 13 + i, 0, tzinfo=timezone.utc),
                    forecast_hour_utc=datetime(2026, 11, 2, 13 + i, 0, tzinfo=timezone.utc),
                )
            )

        # Cap heatmap points at 2, forcing severe heatmap thinning
        grid_result = build_weather_grid(
            routes=[route],
            checkpoints_by_route=[checkpoints],
            initial_interval=HEATMAP_INTERVAL_MILES,
            max_unique_points=2,
        )

        # All 10 checkpoint grid keys are still present in weather_keys!
        cp_keys = [grid_key(c.position.lat, c.position.lng) for c in checkpoints]
        for k in cp_keys:
            assert k in grid_result.weather_keys

    def test_thinning_not_triggered_when_under_cap(self):
        """When heatmap-only points <= cap, no thinning occurs and notice is None."""
        route = self._make_long_route()
        grid_result = build_weather_grid(
            routes=[route],
            checkpoints_by_route=[],
            initial_interval=HEATMAP_INTERVAL_MILES,
            max_unique_points=1000,
        )

        assert grid_result.heatmap_thinned is False
        assert grid_result.heatmap_interval_miles == HEATMAP_INTERVAL_MILES
        assert grid_result.notice is None
