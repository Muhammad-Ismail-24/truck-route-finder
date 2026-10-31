"""Tests for domain/risk.py — all Section 9.5 golden cases plus gust invariant.

Decision refs: D-02 (boundary rule), D-03 (gusts ignored), D-04 (snow in/hr),
               D-05 (worst-of), D-09 (load boundaries strict >).
"""

import pytest

from domain.enums import RiskLevel, WeatherDriver
from domain.models import WeatherSample
from domain.risk import (
    apply_load_rules,
    classify_checkpoint,
    classify_rain,
    classify_snow,
    classify_wind,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ws(wind_mph=0.0, wind_gust_mph=0.0, rain_in_hr=0.0, snow_in_hr=0.0) -> WeatherSample:
    """Build a WeatherSample with convenient defaults."""
    return WeatherSample(
        wind_mph=wind_mph,
        wind_gust_mph=wind_gust_mph,
        rain_in_hr=rain_in_hr,
        snow_in_hr=snow_in_hr,
    )


# ---------------------------------------------------------------------------
# 9.5 Golden: classify_wind — boundary tests (D-02, half-open intervals)
# ---------------------------------------------------------------------------

class TestClassifyWindBoundaries:
    """Wind thresholds: LOW<25, 25≤MOD<35, 35≤HIGH<45, 45≤SEV<55, ≥55 NO_TRAVEL."""

    def test_wind_24_9_is_low(self):
        assert classify_wind(24.9) == RiskLevel.LOW

    def test_wind_25_is_moderate(self):
        assert classify_wind(25.0) == RiskLevel.MODERATE

    def test_wind_34_9_is_moderate(self):
        assert classify_wind(34.9) == RiskLevel.MODERATE

    def test_wind_35_is_high(self):
        assert classify_wind(35.0) == RiskLevel.HIGH

    def test_wind_44_9_is_high(self):
        assert classify_wind(44.9) == RiskLevel.HIGH

    def test_wind_45_is_severe(self):
        assert classify_wind(45.0) == RiskLevel.SEVERE

    def test_wind_54_9_is_severe(self):
        assert classify_wind(54.9) == RiskLevel.SEVERE

    def test_wind_55_is_no_travel(self):
        assert classify_wind(55.0) == RiskLevel.NO_TRAVEL


# ---------------------------------------------------------------------------
# 9.5 Golden: classify_rain — boundary tests (D-02)
# ---------------------------------------------------------------------------

class TestClassifyRainBoundaries:
    """Rain thresholds: LOW<0.10, 0.10≤MOD<0.25, 0.25≤HIGH<0.50, 0.50≤SEV≤1.00, >1.00 NO_TRAVEL."""

    def test_rain_0_099_is_low(self):
        assert classify_rain(0.099) == RiskLevel.LOW

    def test_rain_0_10_is_moderate(self):
        assert classify_rain(0.10) == RiskLevel.MODERATE

    def test_rain_0_25_is_high(self):
        assert classify_rain(0.25) == RiskLevel.HIGH

    def test_rain_0_50_is_severe(self):
        assert classify_rain(0.50) == RiskLevel.SEVERE

    def test_rain_1_00_is_severe(self):
        assert classify_rain(1.00) == RiskLevel.SEVERE

    def test_rain_1_01_is_no_travel(self):
        assert classify_rain(1.01) == RiskLevel.NO_TRAVEL


# ---------------------------------------------------------------------------
# 9.5 Golden: classify_snow — boundary tests (D-02, D-04)
# ---------------------------------------------------------------------------

class TestClassifySnowBoundaries:
    """Snow thresholds: LOW<0.5, 0.5≤MOD<1.0, 1.0≤HIGH<2.0, 2.0≤SEV≤3.0, >3.0 NO_TRAVEL."""

    def test_snow_0_49_is_low(self):
        assert classify_snow(0.49) == RiskLevel.LOW

    def test_snow_0_5_is_moderate(self):
        assert classify_snow(0.5) == RiskLevel.MODERATE

    def test_snow_1_0_is_high(self):
        assert classify_snow(1.0) == RiskLevel.HIGH

    def test_snow_2_0_is_severe(self):
        assert classify_snow(2.0) == RiskLevel.SEVERE

    def test_snow_3_0_is_severe(self):
        assert classify_snow(3.0) == RiskLevel.SEVERE

    def test_snow_3_01_is_no_travel(self):
        assert classify_snow(3.01) == RiskLevel.NO_TRAVEL


# ---------------------------------------------------------------------------
# 9.5 Golden: apply_load_rules (D-09 — strict > on load boundaries)
# ---------------------------------------------------------------------------

class TestApplyLoadRules:
    """Load rules only escalate sustained wind. Strict > per D-09."""

    # Rule 1: wind ≥ 55 → NO_TRAVEL, load_rule = None (already base)
    def test_wind_60_any_load_is_no_travel_no_load_rule(self):
        level, load_rule = apply_load_rules(60.0, 100)
        assert level == RiskLevel.NO_TRAVEL
        assert load_rule is None

    # Rule 2: 45 ≤ wind < 55 and load > 30000 → NO_TRAVEL
    def test_wind_50_load_30000_is_severe_no_rule(self):
        """Exactly 30,000 is NOT > 30,000 — D-09."""
        level, load_rule = apply_load_rules(50.0, 30_000)
        assert level == RiskLevel.SEVERE  # base wind level
        assert load_rule is None

    def test_wind_50_load_30001_is_no_travel_with_rule(self):
        """30,001 > 30,000 triggers the rule — D-09."""
        level, load_rule = apply_load_rules(50.0, 30_001)
        assert level == RiskLevel.NO_TRAVEL
        assert load_rule == "WIND_45_54_OVER_30K"

    # Rule 3: 35 ≤ wind < 45 and load > 40000 → at least SEVERE
    def test_wind_40_load_40000_is_high_no_rule(self):
        """Exactly 40,000 is NOT > 40,000 — D-09."""
        level, load_rule = apply_load_rules(40.0, 40_000)
        assert level == RiskLevel.HIGH  # base wind level
        assert load_rule is None

    def test_wind_40_load_40001_is_severe_with_rule(self):
        """40,001 > 40,000 triggers the rule — D-09."""
        level, load_rule = apply_load_rules(40.0, 40_001)
        assert level == RiskLevel.SEVERE
        assert load_rule == "WIND_35_44_OVER_40K"

    def test_wind_30_load_80000_is_moderate_no_rule(self):
        """No rule applies below 35 mph regardless of load."""
        level, load_rule = apply_load_rules(30.0, 80_000)
        assert level == RiskLevel.MODERATE
        assert load_rule is None

    def test_wind_44_load_35000_is_high_no_rule(self):
        """44 mph is in 35–44 band; 35,000 is not > 40,000 — Rule 3 not met."""
        level, load_rule = apply_load_rules(44.0, 35_000)
        assert level == RiskLevel.HIGH
        assert load_rule is None


# ---------------------------------------------------------------------------
# 9.5 Golden: classify_checkpoint (D-05 worst-of, driver tie-break, load rules)
# ---------------------------------------------------------------------------

class TestClassifyCheckpoint:
    """Full checkpoint classification: worst-of weather with load rules applied."""

    def test_all_zeros_is_low(self):
        result = classify_checkpoint(ws(), load_weight_lb=20_000)
        assert result.level == RiskLevel.LOW
        assert result.load_rule is None

    def test_wind_30_rain_0_30_snow_0_driver_is_rain(self):
        """MODERATE wind < HIGH rain → checkpoint is HIGH, driver RAIN (D-05)."""
        result = classify_checkpoint(ws(wind_mph=30.0, rain_in_hr=0.30), load_weight_lb=20_000)
        assert result.level == RiskLevel.HIGH
        assert result.driver == WeatherDriver.RAIN

    def test_wind_40_load_50000_rain_0_30_driver_is_wind(self):
        """Wind 40 + load 50k → SEVERE (rule 3); rain 0.30 → HIGH. SEVERE wins, driver WIND."""
        result = classify_checkpoint(
            ws(wind_mph=40.0, rain_in_hr=0.30),
            load_weight_lb=50_000,
        )
        assert result.level == RiskLevel.SEVERE
        assert result.driver == WeatherDriver.WIND
        assert result.load_rule == "WIND_35_44_OVER_40K"

    def test_wind_50_load_30001_is_no_travel(self):
        result = classify_checkpoint(ws(wind_mph=50.0), load_weight_lb=30_001)
        assert result.level == RiskLevel.NO_TRAVEL
        assert result.load_rule == "WIND_45_54_OVER_30K"

    def test_wind_50_load_30000_is_severe(self):
        result = classify_checkpoint(ws(wind_mph=50.0), load_weight_lb=30_000)
        assert result.level == RiskLevel.SEVERE
        assert result.load_rule is None

    def test_wind_40_load_40000_is_high(self):
        result = classify_checkpoint(ws(wind_mph=40.0), load_weight_lb=40_000)
        assert result.level == RiskLevel.HIGH
        assert result.load_rule is None

    def test_wind_40_load_40001_is_severe(self):
        result = classify_checkpoint(ws(wind_mph=40.0), load_weight_lb=40_001)
        assert result.level == RiskLevel.SEVERE
        assert result.load_rule == "WIND_35_44_OVER_40K"

    def test_wind_30_load_80000_is_moderate(self):
        result = classify_checkpoint(ws(wind_mph=30.0), load_weight_lb=80_000)
        assert result.level == RiskLevel.MODERATE
        assert result.load_rule is None

    def test_wind_44_load_35000_is_high(self):
        result = classify_checkpoint(ws(wind_mph=44.0), load_weight_lb=35_000)
        assert result.level == RiskLevel.HIGH
        assert result.load_rule is None

    def test_wind_60_load_100_is_no_travel(self):
        result = classify_checkpoint(ws(wind_mph=60.0), load_weight_lb=100)
        assert result.level == RiskLevel.NO_TRAVEL
        # Rule 1 (already base NO_TRAVEL) → load_rule is None
        assert result.load_rule is None

    # individual level fields
    def test_risk_assessment_level_fields_populated(self):
        result = classify_checkpoint(
            ws(wind_mph=30.0, rain_in_hr=0.30, snow_in_hr=0.6),
            load_weight_lb=20_000,
        )
        # wind=30→MODERATE, rain=0.30→HIGH, snow=0.6→MODERATE
        assert result.wind_level == RiskLevel.MODERATE
        assert result.rain_level == RiskLevel.HIGH
        assert result.snow_level == RiskLevel.MODERATE
        assert result.level == RiskLevel.HIGH
        assert result.driver == WeatherDriver.RAIN


# ---------------------------------------------------------------------------
# D-03: Gusts NEVER affect risk (gust invariant)
# ---------------------------------------------------------------------------

class TestGustsNeverAffectRisk:
    """Wind gusts are display-only (D-03). No matter how high the gust,
    risk is determined solely by sustained wind_mph."""

    def test_low_sustained_high_gust_is_still_low(self):
        """Gust 999 mph must not elevate risk beyond the sustained level."""
        result = classify_checkpoint(
            ws(wind_mph=10.0, wind_gust_mph=999.0),
            load_weight_lb=20_000,
        )
        assert result.level == RiskLevel.LOW

    def test_gust_does_not_trigger_load_rule(self):
        """Even with load > 30k, a massive gust on 20 mph sustained → MODERATE."""
        result = classify_checkpoint(
            ws(wind_mph=20.0, wind_gust_mph=60.0),
            load_weight_lb=40_000,
        )
        assert result.level == RiskLevel.LOW  # wind_mph=20 → LOW; no load rule
        assert result.load_rule is None

    @pytest.mark.parametrize("gust", [0.0, 35.0, 55.0, 100.0, 999.0])
    def test_same_sustained_wind_same_risk_regardless_of_gust(self, gust):
        """Risk is invariant to the gust value for a fixed sustained wind."""
        base = classify_checkpoint(ws(wind_mph=30.0, wind_gust_mph=0.0), load_weight_lb=20_000)
        variant = classify_checkpoint(ws(wind_mph=30.0, wind_gust_mph=gust), load_weight_lb=20_000)
        assert variant.level == base.level
        assert variant.wind_level == base.wind_level
        assert variant.load_rule == base.load_rule


# ---------------------------------------------------------------------------
# Driver tie-break order: WIND > RAIN > SNOW (D-05)
# ---------------------------------------------------------------------------

class TestDriverTieBreak:
    """When multiple weather phenomena share the max level, WIND wins, then RAIN."""

    def test_wind_and_rain_tie_wind_wins(self):
        """wind=25→MODERATE, rain=0.10→MODERATE; WIND picked first."""
        result = classify_checkpoint(
            ws(wind_mph=25.0, rain_in_hr=0.10),
            load_weight_lb=20_000,
        )
        assert result.level == RiskLevel.MODERATE
        assert result.driver == WeatherDriver.WIND

    def test_rain_and_snow_tie_rain_wins(self):
        """wind=0→LOW, rain=0.10→MODERATE, snow=0.5→MODERATE; RAIN picked before SNOW."""
        result = classify_checkpoint(
            ws(wind_mph=0.0, rain_in_hr=0.10, snow_in_hr=0.5),
            load_weight_lb=20_000,
        )
        assert result.level == RiskLevel.MODERATE
        assert result.driver == WeatherDriver.RAIN

    def test_only_snow_elevated_snow_is_driver(self):
        """wind=LOW, rain=LOW, snow=HIGH → driver SNOW."""
        result = classify_checkpoint(
            ws(wind_mph=10.0, rain_in_hr=0.05, snow_in_hr=1.5),
            load_weight_lb=20_000,
        )
        assert result.level == RiskLevel.HIGH
        assert result.driver == WeatherDriver.SNOW
