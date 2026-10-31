"""Tests for domain/ranking.py.

Covers:
  - Lexicographic sort key: (no_travel, severe, high, avg_risk, duration_min) (D-19)
  - Tier 0 (No Travel) beats everything (even 0 Severe vs 100 Severe)
  - Severe beats High; High beats avg risk; avg risk beats time; time is final tiebreaker
  - Rounding rule: miles differing by < 0.05 tie on that tier
  - Single-route and two-route inputs
  - Status OK vs OK_WITH_WARNING (severe > 0 or no_travel > 0)
  - Reason strings naming correct routes and numbers
  - Special first reason when every route crosses No Travel (D-08)
"""

from datetime import datetime, timezone

from domain.enums import RiskLevel
from domain.models import RouteSummary
from domain.ranking import rank_routes

UTC = timezone.utc


def make_summary(
    no_travel: float = 0.0,
    severe: float = 0.0,
    high: float = 0.0,
    moderate: float = 0.0,
    low: float = 0.0,
    avg_risk: float = 1.0,
    duration_minutes: float = 60.0,
) -> RouteSummary:
    """Convenience helper to create a RouteSummary with specific metrics."""
    total_miles = no_travel + severe + high + moderate + low
    if total_miles == 0.0:
        total_miles = 100.0
        low = 100.0

    departure = datetime(2026, 11, 2, 8, 0, 0, tzinfo=UTC)
    buffered_s = duration_minutes * 60.0

    return RouteSummary(
        distance_miles=total_miles,
        base_duration_s=buffered_s / 1.10,
        buffered_duration_s=buffered_s,
        departure_utc=departure,
        arrival_utc=departure,
        miles_by_level={
            RiskLevel.LOW: low,
            RiskLevel.MODERATE: moderate,
            RiskLevel.HIGH: high,
            RiskLevel.SEVERE: severe,
            RiskLevel.NO_TRAVEL: no_travel,
        },
        avg_risk=avg_risk,
        max_level=RiskLevel.NO_TRAVEL
        if no_travel > 0
        else RiskLevel.SEVERE
        if severe > 0
        else RiskLevel.HIGH
        if high > 0
        else RiskLevel.MODERATE
        if moderate > 0
        else RiskLevel.LOW,
    )


class TestRankingTiers:
    def test_tier_0_no_travel_beats_everything(self):
        """A route with 0 Severe but 5 No Travel miles loses to 100 Severe and 0 No Travel."""
        # Route A: 5 miles No Travel, 0 Severe
        summary_a = make_summary(no_travel=5.0, severe=0.0)
        # Route B: 0 miles No Travel, 100 Severe
        summary_b = make_summary(no_travel=0.0, severe=100.0)

        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        assert result.recommended_route_id == "route-2"
        assert result.ranking[0].route_id == "route-2"
        assert result.ranking[1].route_id == "route-1"

    def test_severe_tier_beats_high_tier(self):
        """0 Severe and 50 High beats 10 Severe and 0 High."""
        summary_a = make_summary(severe=10.0, high=0.0)
        summary_b = make_summary(severe=0.0, high=50.0)

        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        assert result.recommended_route_id == "route-2"

    def test_high_tier_beats_avg_risk(self):
        """10 High and avg 2.8 beats 20 High and avg 2.1."""
        summary_a = make_summary(high=10.0, avg_risk=2.8)
        summary_b = make_summary(high=20.0, avg_risk=2.1)

        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        assert result.recommended_route_id == "route-1"

    def test_avg_risk_beats_time(self):
        """avg risk 1.40 and 120 min beats avg risk 1.80 and 60 min."""
        summary_a = make_summary(avg_risk=1.40, duration_minutes=120.0)
        summary_b = make_summary(avg_risk=1.80, duration_minutes=60.0)

        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        assert result.recommended_route_id == "route-1"

    def test_time_is_final_tiebreaker(self):
        """When risk metrics tie exactly, shorter duration wins."""
        summary_a = make_summary(avg_risk=1.50, duration_minutes=90.0)
        summary_b = make_summary(avg_risk=1.50, duration_minutes=60.0)

        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        assert result.recommended_route_id == "route-2"

    def test_rounding_rule_miles_differing_by_under_0_05_tie(self):
        """Miles differing by < 0.05 round to same 1-decimal value and tie on that tier."""
        # 10.04 rounds to 10.0; 10.01 rounds to 10.0
        # Route A has faster time so it should win when Severe miles tie
        summary_a = make_summary(severe=10.04, duration_minutes=50.0)
        summary_b = make_summary(severe=10.01, duration_minutes=80.0)

        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        assert result.recommended_route_id == "route-1"


class TestRouteCountsAndEdgeCases:
    def test_single_route_input(self):
        summary = make_summary(avg_risk=1.20)
        result = rank_routes({"route-1": summary})
        assert result.recommended_route_id == "route-1"
        assert result.status == "OK"
        assert result.reasons == ["Only one route was available."]

    def test_two_route_input(self):
        summary_a = make_summary(severe=42.5)
        summary_b = make_summary(severe=0.0)
        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        assert result.recommended_route_id == "route-2"
        assert len(result.ranking) == 2


class TestStatusAndWarnings:
    def test_ok_status_when_no_severe_or_no_travel(self):
        summary = make_summary(high=20.0, avg_risk=1.5)
        result = rank_routes({"route-1": summary})
        assert result.status == "OK"

    def test_ok_with_warning_when_severe_miles_exist(self):
        summary = make_summary(severe=15.0)
        result = rank_routes({"route-1": summary})
        assert result.status == "OK_WITH_WARNING"

    def test_ok_with_warning_when_no_travel_miles_exist(self):
        summary = make_summary(no_travel=5.0)
        result = rank_routes({"route-1": summary})
        assert result.status == "OK_WITH_WARNING"

    def test_special_first_reason_when_every_route_has_no_travel(self):
        """D-08: If recommended route has No Travel, first reason explains it's least bad."""
        summary_a = make_summary(no_travel=10.0)
        summary_b = make_summary(no_travel=2.0)
        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        assert result.status == "OK_WITH_WARNING"
        assert (
            result.reasons[0]
            == "Every route crosses No Travel conditions; this is the least bad option."
        )


class TestReasonStringsFormatting:
    def test_reason_explains_severe_tier_difference(self):
        """Checks: 'Route B has 0 Severe miles vs 42.5 for Route A.'"""
        summary_a = make_summary(severe=42.5)
        summary_b = make_summary(severe=0.0)
        result = rank_routes({"route-1": summary_a, "route-2": summary_b})
        # Route B is recommended over Route A
        assert any("Route B has 0 Severe miles vs 42.5 for Route A." in r for r in result.reasons)

    def test_reason_explains_time_when_weather_ties(self):
        """Checks: 'Routes tie on weather risk; Route C is 38 min faster.'"""
        summary_a = make_summary(duration_minutes=98.0)
        summary_b = make_summary(duration_minutes=60.0)  # 38 min faster
        labels = {"route-1": "Route A", "route-2": "Route C"}
        result = rank_routes({"route-1": summary_a, "route-2": summary_b}, labels=labels)
        expected = "Routes tie on weather risk; Route C is 38 min faster."
        assert any(expected in r for r in result.reasons)
