"""Tests for domain/aggregation.py.

Covers:
  - summarize_route:
    - miles_by_level always contains all five RiskLevel keys
    - avg_risk is mile-weighted average (LOW=1 .. NO_TRAVEL=5) (D-07)
    - max_level is the highest RiskLevel present
    - edge cases: all LOW, mixed levels, zero-distance/empty checkpoints
"""

import math
from datetime import datetime, timezone

from domain.aggregation import summarize_route
from domain.enums import RiskLevel, WeatherDriver
from domain.models import Checkpoint, LatLng, RiskAssessment, RouteSummary

UTC = timezone.utc


def make_checkpoint(index: int, segment_miles: float, eta_hours: float = 1.0) -> Checkpoint:
    eta = datetime(2026, 11, 2, 8, 0, 0, tzinfo=UTC)
    return Checkpoint(
        index=index,
        mile=float(index * 25),
        position=LatLng(lat=40.0 + index, lng=-100.0),
        segment_miles=segment_miles,
        eta_utc=eta,
        forecast_hour_utc=eta,
    )


def make_risk(level: RiskLevel) -> RiskAssessment:
    return RiskAssessment(
        level=level,
        wind_level=level,
        rain_level=RiskLevel.LOW,
        snow_level=RiskLevel.LOW,
        driver=WeatherDriver.WIND,
        load_rule=None,
    )


class TestSummarizeRoute:
    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 8, 0, 0, tzinfo=UTC)
        self.base_duration_s = 3600.0
        self.buffered_duration_s = 3960.0

    def test_all_five_keys_present_in_miles_by_level(self):
        """miles_by_level must always contain all 5 RiskLevel keys even if 0.0."""
        cps = [make_checkpoint(0, 50.0)]
        risks = [make_risk(RiskLevel.LOW)]

        summary: RouteSummary = summarize_route(
            checkpoints=cps,
            risks=risks,
            base_duration_s=self.base_duration_s,
            buffered_duration_s=self.buffered_duration_s,
            departure_utc=self.departure,
        )

        assert set(summary.miles_by_level.keys()) == set(RiskLevel)
        assert summary.miles_by_level[RiskLevel.LOW] == 50.0
        assert summary.miles_by_level[RiskLevel.MODERATE] == 0.0
        assert summary.miles_by_level[RiskLevel.HIGH] == 0.0
        assert summary.miles_by_level[RiskLevel.SEVERE] == 0.0
        assert summary.miles_by_level[RiskLevel.NO_TRAVEL] == 0.0

    def test_mile_weighted_avg_risk_calculation(self):
        """D-07: avg_risk = Σ(int(level) * segment_miles) / total_miles.

        Example:
          - 20 miles LOW (1)
          - 30 miles HIGH (3)
          Total = 50 miles.
          Weighted sum = 20*1 + 30*3 = 20 + 90 = 110.
          Avg risk = 110 / 50 = 2.20.
        """
        cps = [make_checkpoint(0, 20.0), make_checkpoint(1, 30.0)]
        risks = [make_risk(RiskLevel.LOW), make_risk(RiskLevel.HIGH)]

        summary = summarize_route(
            checkpoints=cps,
            risks=risks,
            base_duration_s=self.base_duration_s,
            buffered_duration_s=self.buffered_duration_s,
            departure_utc=self.departure,
        )

        assert math.isclose(summary.distance_miles, 50.0, abs_tol=1e-6)
        assert math.isclose(summary.avg_risk, 2.20, abs_tol=1e-6)
        assert summary.max_level == RiskLevel.HIGH

    def test_max_level_identified(self):
        """max_level is the highest risk level among all checkpoints."""
        cps = [
            make_checkpoint(0, 10.0),
            make_checkpoint(1, 10.0),
            make_checkpoint(2, 10.0),
        ]
        risks = [
            make_risk(RiskLevel.MODERATE),
            make_risk(RiskLevel.SEVERE),
            make_risk(RiskLevel.HIGH),
        ]

        summary = summarize_route(
            cps, risks, self.base_duration_s, self.buffered_duration_s, self.departure
        )
        assert summary.max_level == RiskLevel.SEVERE
        assert summary.miles_by_level[RiskLevel.SEVERE] == 10.0

    def test_summary_duration_and_timestamps(self):
        cps = [make_checkpoint(0, 25.0), make_checkpoint(1, 25.0)]
        risks = [make_risk(RiskLevel.LOW), make_risk(RiskLevel.LOW)]

        summary = summarize_route(
            cps, risks, self.base_duration_s, self.buffered_duration_s, self.departure
        )
        assert summary.base_duration_s == self.base_duration_s
        assert summary.buffered_duration_s == self.buffered_duration_s
        assert summary.departure_utc == self.departure
        assert summary.arrival_utc == cps[-1].eta_utc

    def test_empty_checkpoints_handling(self):
        summary = summarize_route(
            [], [], self.base_duration_s, self.buffered_duration_s, self.departure
        )
        assert summary.distance_miles == 0.0
        assert summary.avg_risk == 1.0
        assert summary.max_level == RiskLevel.LOW
        assert set(summary.miles_by_level.keys()) == set(RiskLevel)
        assert all(v == 0.0 for v in summary.miles_by_level.values())
