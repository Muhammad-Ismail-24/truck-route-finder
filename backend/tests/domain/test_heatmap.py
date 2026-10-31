"""Tests for domain/heatmap.py.

Covers:
  - 49 values (hours 0..48) per point for risk (RiskLevel - 1), wind_mph, rain_in_hr, snow_in_hr
  - Load-awareness using classify_checkpoint (50k lb vs 10k lb at 40 mph produces different risk)
  - Load-awareness at 50 mph (35k lb vs 20k lb)
  - Metric rounding per Section 14 (wind 1 decimal, rain 2 decimals, snow 2 decimals, risk int 0..4)
  - Missing hours repeat the last available value and set truncated=True
  - Mid-series gaps repeat last available value and resume afterwards
  - Multiple points along corridor with independent or shared grid series
  - Grid key resolution (LatLng, tuple, unrounded lat/lng matched to 2-decimal grid key)
  - Departure hour floored to UTC hour (D-20, Section 6.6)
  - Empty points handling
  - Subscriptable and attribute access on results
"""

from datetime import datetime, timedelta, timezone

import pytest

from domain.heatmap import build_heatmap
from domain.models import HeatmapPoint, HeatmapResult, HourlySeries, LatLng

UTC = timezone.utc


def make_hourly_series(
    start_utc: datetime,
    hours_count: int = 49,
    base_wind: float = 15.0,
    base_wind_gust: float = 20.0,
    base_rain: float = 0.0,
    base_snow: float = 0.0,
    hourly_overrides: dict[int, tuple[float, float, float, float]] | None = None,
) -> HourlySeries:
    """Generate an HourlySeries with specified base values and optional hour overrides.

    hourly_overrides: dict of hour_index -> (wind_mph, wind_gust_mph, rain_in_hr, snow_in_hr)
    """
    times: list[datetime] = []
    winds: list[float] = []
    gusts: list[float] = []
    rains: list[float] = []
    snows: list[float] = []

    for h in range(hours_count):
        t = start_utc + timedelta(hours=h)
        times.append(t)
        if hourly_overrides and h in hourly_overrides:
            w, g, r, s = hourly_overrides[h]
            winds.append(w)
            gusts.append(g)
            rains.append(r)
            snows.append(s)
        else:
            winds.append(base_wind)
            gusts.append(base_wind_gust)
            rains.append(base_rain)
            snows.append(base_snow)

    return HourlySeries(
        times_utc=times,
        wind_mph=winds,
        wind_gust_mph=gusts,
        rain_in_hr=rains,
        snow_in_hr=snows,
    )


class TestHeatmapBuilderBasics:
    """Verify basic 49-hour arrays, structure, and metric ranges."""

    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)
        self.point = LatLng(lat=41.88, lng=-87.63)
        self.grid_key = (41.88, -87.63)

    def test_build_heatmap_49_values_per_point(self):
        """Must return exactly 49 values (hours 0..48) for each metric array."""
        series = make_hourly_series(self.departure, hours_count=49, base_wind=20.0)
        series_by_key = {self.grid_key: series}

        result: HeatmapResult = build_heatmap(
            points=[self.point],
            series_by_key=series_by_key,
            departure_hour_utc=self.departure,
            load_weight_lb=20_000,
        )

        assert isinstance(result, HeatmapResult)
        assert result.hours == 49
        assert result.start_utc == self.departure
        assert result.truncated is False
        assert len(result.points) == 1

        pt = result.points[0]
        assert isinstance(pt, HeatmapPoint)
        assert pt.lat == 41.88
        assert pt.lng == -87.63
        assert len(pt.risk) == 49
        assert len(pt.wind_mph) == 49
        assert len(pt.rain_in_hr) == 49
        assert len(pt.snow_in_hr) == 49

        # All risk values in 0..4 (LOW=0 .. NO_TRAVEL=4)
        assert all(0 <= r <= 4 for r in pt.risk)
        assert all(isinstance(r, int) for r in pt.risk)

    def test_empty_points_list(self):
        """Empty points input returns empty result with truncated=False."""
        result = build_heatmap(
            points=[],
            series_by_key={},
            departure_hour_utc=self.departure,
            load_weight_lb=20_000,
        )
        assert result.hours == 49
        assert result.truncated is False
        assert result.points == []


class TestHeatmapLoadAwareness:
    """Verify load-awareness via classify_checkpoint escalation rules (D-20)."""

    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)
        self.point = LatLng(lat=40.0, lng=-90.0)
        self.grid_key = (40.0, -90.0)

    def test_50k_vs_10k_lb_at_40mph_wind_produce_different_risk(self):
        """Requirement: 50,000 lb vs 10,000 lb load at 40 mph wind produce different risk values.

        Wind = 40 mph:
          - 10,000 lb: Rule 3 not triggered (10k not > 40k) -> base HIGH -> risk = 2 (HIGH - 1)
          - 50,000 lb: Rule 3 triggered (40 mph in [35, 45) and 50k > 40k) -> SEVERE -> risk = 3
        """
        series = make_hourly_series(self.departure, hours_count=49, base_wind=40.0)
        series_by_key = {self.grid_key: series}

        result_10k = build_heatmap(
            points=[self.point],
            series_by_key=series_by_key,
            departure_hour_utc=self.departure,
            load_weight_lb=10_000,
        )

        result_50k = build_heatmap(
            points=[self.point],
            series_by_key=series_by_key,
            departure_hour_utc=self.departure,
            load_weight_lb=50_000,
        )

        risk_10k = result_10k.points[0].risk
        risk_50k = result_50k.points[0].risk

        # They must be different
        assert risk_50k != risk_10k

        # For hour 0 (and all hours with 40 mph wind):
        assert risk_10k[0] == 2  # RiskLevel.HIGH (3) - 1
        assert risk_50k[0] == 3  # RiskLevel.SEVERE (4) - 1

    def test_35k_vs_20k_lb_at_50mph_wind(self):
        """Wind = 50 mph:
        - 20,000 lb: Rule 2 not triggered (20k not > 30k) -> base SEVERE -> risk = 3
        - 35,000 lb: Rule 2 triggered (50 mph in [45, 55) and 35k > 30k) -> NO_TRAVEL -> risk = 4
        """
        series = make_hourly_series(self.departure, hours_count=49, base_wind=50.0)
        series_by_key = {self.grid_key: series}

        res_20k = build_heatmap([self.point], series_by_key, self.departure, 20_000)
        res_35k = build_heatmap([self.point], series_by_key, self.departure, 35_000)

        assert res_20k.points[0].risk[0] == 3  # SEVERE - 1
        assert res_35k.points[0].risk[0] == 4  # NO_TRAVEL - 1
        assert res_20k.points[0].risk != res_35k.points[0].risk


class TestHeatmapRounding:
    """Verify Section 14 rounding: wind 1 decimal, rain 2 decimals, snow 2 decimals."""

    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)
        self.point = LatLng(lat=41.88, lng=-87.63)
        self.grid_key = (41.88, -87.63)

    def test_metric_rounding(self):
        """Values must be rounded to: wind 1 dec, rain 2 dec, snow 2 dec."""
        overrides = {
            0: (12.345, 18.0, 0.126, 0.554),  # wind 12.3, rain 0.13, snow 0.55
            1: (24.96, 30.0, 0.244, 1.999),  # wind 25.0, rain 0.24, snow 2.00
        }
        series = make_hourly_series(self.departure, hours_count=49, hourly_overrides=overrides)
        result = build_heatmap([self.point], {self.grid_key: series}, self.departure, 20_000)

        pt = result.points[0]
        assert pt.wind_mph[0] == 12.3
        assert pt.rain_in_hr[0] == 0.13
        assert pt.snow_in_hr[0] == 0.55

        assert pt.wind_mph[1] == 25.0
        assert pt.rain_in_hr[1] == 0.24
        assert pt.snow_in_hr[1] == 2.00


class TestHeatmapTruncationAndMissingHours:
    """Verify missing hours repeat last available value and set truncated=True."""

    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)
        self.point = LatLng(lat=41.88, lng=-87.63)
        self.grid_key = (41.88, -87.63)

    def test_forecast_shorter_than_49_hours(self):
        """When series only has 24 hours, hours 24..48 repeat hour 23 and truncated=True."""
        # Hour 23 has specific distinctive values
        overrides = {23: (38.0, 45.0, 0.35, 1.50)}
        series = make_hourly_series(
            self.departure,
            hours_count=24,
            base_wind=10.0,
            hourly_overrides=overrides,
        )

        result = build_heatmap([self.point], {self.grid_key: series}, self.departure, 20_000)

        assert result.truncated is True
        pt = result.points[0]
        assert len(pt.risk) == 49
        assert len(pt.wind_mph) == 49
        assert len(pt.rain_in_hr) == 49
        assert len(pt.snow_in_hr) == 49

        # Hours 0..22 have base wind 10.0
        assert pt.wind_mph[0] == 10.0

        # Hour 23 has wind 38.0
        assert pt.wind_mph[23] == 38.0
        assert pt.rain_in_hr[23] == 0.35
        assert pt.snow_in_hr[23] == 1.50

        # Hours 24..48 must repeat hour 23
        for h in range(24, 49):
            assert pt.wind_mph[h] == 38.0
            assert pt.rain_in_hr[h] == 0.35
            assert pt.snow_in_hr[h] == 1.50
            assert pt.risk[h] == pt.risk[23]

    def test_gap_in_middle_of_series(self):
        """Missing hour in the middle repeats preceding hour and sets truncated=True."""
        # Create series with hours 0..9 and 11..48 (hour 10 missing)
        full_series = make_hourly_series(
            self.departure,
            hours_count=49,
            base_wind=10.0,
            hourly_overrides={
                9: (20.0, 25.0, 0.1, 0.0),
                11: (30.0, 35.0, 0.2, 0.0),
            },
        )
        # Drop index 10
        times = [t for i, t in enumerate(full_series.times_utc) if i != 10]
        winds = [w for i, w in enumerate(full_series.wind_mph) if i != 10]
        gusts = [g for i, g in enumerate(full_series.wind_gust_mph) if i != 10]
        rains = [r for i, r in enumerate(full_series.rain_in_hr) if i != 10]
        snows = [s for i, s in enumerate(full_series.snow_in_hr) if i != 10]

        gapped_series = HourlySeries(
            times_utc=times,
            wind_mph=winds,
            wind_gust_mph=gusts,
            rain_in_hr=rains,
            snow_in_hr=snows,
        )

        result = build_heatmap([self.point], {self.grid_key: gapped_series}, self.departure, 20_000)

        assert result.truncated is True
        pt = result.points[0]
        assert len(pt.risk) == 49
        assert pt.wind_mph[9] == 20.0
        # Hour 10 repeats hour 9
        assert pt.wind_mph[10] == 20.0
        # Hour 11 resumes at 30.0
        assert pt.wind_mph[11] == 30.0


class TestHeatmapPointsAndCoordResolution:
    """Verify coordinate handling, grid key resolution, and multiple points."""

    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)

    def test_grid_key_lookup_from_unrounded_latlng(self):
        """Input LatLng with high precision is looked up via (round(lat, 2), round(lng, 2))."""
        pt = LatLng(lat=41.87811, lng=-87.62979)
        grid_key = (41.88, -87.63)
        series = make_hourly_series(self.departure, hours_count=49, base_wind=15.0)

        result = build_heatmap([pt], {grid_key: series}, self.departure, 20_000)

        assert len(result.points) == 1
        assert result.points[0].lat == 41.88
        assert result.points[0].lng == -87.63
        assert result.points[0].wind_mph[0] == 15.0

    def test_tuple_coordinates_input(self):
        """Accepts (lat, lng) tuples as points."""
        pt = (39.74, -104.99)
        grid_key = (39.74, -104.99)
        series = make_hourly_series(self.departure, hours_count=49, base_wind=22.0)

        result = build_heatmap([pt], {grid_key: series}, self.departure, 20_000)
        assert len(result.points) == 1
        assert result.points[0].lat == 39.74
        assert result.points[0].lng == -104.99
        assert result.points[0].wind_mph[0] == 22.0

    def test_multiple_points_corridor(self):
        """Builds heatmap for multiple points along the corridor."""
        p1 = LatLng(lat=41.88, lng=-87.63)
        p2 = LatLng(lat=41.60, lng=-88.20)
        k1 = (41.88, -87.63)
        k2 = (41.60, -88.20)

        s1 = make_hourly_series(self.departure, hours_count=49, base_wind=10.0)
        s2 = make_hourly_series(self.departure, hours_count=49, base_wind=28.0)

        result = build_heatmap([p1, p2], {k1: s1, k2: s2}, self.departure, 20_000)

        assert len(result.points) == 2
        assert result.points[0].wind_mph[0] == 10.0
        assert result.points[0].risk[0] == 0  # LOW - 1
        assert result.points[1].wind_mph[0] == 28.0
        assert result.points[1].risk[0] == 1  # MODERATE - 1

    def test_departure_hour_flooring_and_tz_offset(self):
        """Departure time with minutes/seconds and non-UTC offset floors to correct UTC hour."""
        # 08:35:10 -05:00 = 13:35:10 UTC -> floors to 13:00:00 UTC
        tz_chicago = timezone(timedelta(hours=-5))
        dep_local = datetime(2026, 11, 2, 8, 35, 10, tzinfo=tz_chicago)
        expected_utc = datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)

        pt = LatLng(lat=41.88, lng=-87.63)
        grid_key = (41.88, -87.63)
        series = make_hourly_series(expected_utc, hours_count=49, base_wind=18.0)

        result = build_heatmap([pt], {grid_key: series}, dep_local, 20_000)

        assert result.start_utc == expected_utc
        assert result.points[0].wind_mph[0] == 18.0

    def test_dict_subscripting_and_to_dict_access(self):
        """HeatmapResult and HeatmapPoint support __getitem__ subscription."""
        pt = LatLng(lat=41.88, lng=-87.63)
        grid_key = (41.88, -87.63)
        series = make_hourly_series(self.departure, hours_count=49, base_wind=18.0)

        result = build_heatmap([pt], {grid_key: series}, self.departure, 20_000)

        assert result["hours"] == 49
        assert result["truncated"] is False
        assert len(result["points"]) == 1
        assert result["points"][0]["lat"] == 41.88
        assert result["points"][0]["risk"][0] == 0

    def test_missing_grid_key_raises_key_error(self):
        """If a point's grid key is missing from series_by_key, raises KeyError."""
        pt = LatLng(lat=45.0, lng=-95.0)
        with pytest.raises(KeyError):
            build_heatmap([pt], {}, self.departure, 20_000)
