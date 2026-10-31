"""Risk classifier for Spotter Truck Routing.

Implements Section 9 of ARCHITECTURE.md.
Key decisions:
  D-02  Half-open intervals [lower, upper); value belongs to the higher level.
  D-03  Sustained wind only; gusts are display-only.
  D-04  Snow in inches/hour directly from Open-Meteo snowfall variable.
  D-05  Checkpoint level = worst-of(wind_level, rain_level, snow_level).
  D-09  Load boundaries are strict >; exactly 30 000 or 40 000 lb does NOT trigger.

No I/O, no Django imports.
"""

from domain.enums import RiskLevel, WeatherDriver
from domain.models import RiskAssessment, WeatherSample

# ---------------------------------------------------------------------------
# 9.2  Base threshold classifiers
# ---------------------------------------------------------------------------

def classify_wind(wind_mph: float) -> RiskLevel:
    """Classify sustained wind speed in mph (D-02, D-03).

    Intervals are half-open [lower, upper); the boundary belongs to the higher level.
    """
    if wind_mph < 25:
        return RiskLevel.LOW
    if wind_mph < 35:
        return RiskLevel.MODERATE
    if wind_mph < 45:
        return RiskLevel.HIGH
    if wind_mph < 55:
        return RiskLevel.SEVERE
    return RiskLevel.NO_TRAVEL


def classify_rain(rain_in_hr: float) -> RiskLevel:
    """Classify rain rate in inches per hour (D-02).

    Rain SEVERE band is [0.50, 1.00]; exactly 1.00 is SEVERE, >1.00 is NO_TRAVEL.
    """
    if rain_in_hr < 0.10:
        return RiskLevel.LOW
    if rain_in_hr < 0.25:
        return RiskLevel.MODERATE
    if rain_in_hr < 0.50:
        return RiskLevel.HIGH
    if rain_in_hr <= 1.00:
        return RiskLevel.SEVERE
    return RiskLevel.NO_TRAVEL


def classify_snow(snow_in_hr: float) -> RiskLevel:
    """Classify snowfall rate in inches per hour (D-02, D-04).

    Snow SEVERE band is [2.0, 3.0]; exactly 3.0 is SEVERE, >3.0 is NO_TRAVEL.
    """
    if snow_in_hr < 0.5:
        return RiskLevel.LOW
    if snow_in_hr < 1.0:
        return RiskLevel.MODERATE
    if snow_in_hr < 2.0:
        return RiskLevel.HIGH
    if snow_in_hr <= 3.0:
        return RiskLevel.SEVERE
    return RiskLevel.NO_TRAVEL


# ---------------------------------------------------------------------------
# 9.3  Load rules (wind escalation only)
# ---------------------------------------------------------------------------

def apply_load_rules(wind_mph: float, load_weight_lb: int) -> tuple[RiskLevel, str | None]:
    """Apply load-based escalation rules to the base wind level.

    Returns (effective_wind_level, load_rule | None).

    Rules (evaluated in priority order):
      1. wind >= 55                → NO_TRAVEL for any load.  load_rule = None
         (this is already the base level; the rule cannot raise it further)
      2. 45 <= wind < 55 AND load > 30_000  → NO_TRAVEL.  load_rule = WIND_45_54_OVER_30K
      3. 35 <= wind < 45 AND load > 40_000  → at least SEVERE. load_rule = WIND_35_44_OVER_40K

    D-09: boundaries are strict >; exactly 30_000 and 40_000 do NOT trigger.
    """
    base = classify_wind(wind_mph)

    # Rule 2
    if 45 <= wind_mph < 55 and load_weight_lb > 30_000:
        return RiskLevel.NO_TRAVEL, "WIND_45_54_OVER_30K"

    # Rule 3
    if 35 <= wind_mph < 45 and load_weight_lb > 40_000:
        escalated = max(base, RiskLevel.SEVERE)
        return escalated, "WIND_35_44_OVER_40K"

    # Rule 1 / no rule applies
    return base, None


# ---------------------------------------------------------------------------
# 9.4  Full checkpoint classification
# ---------------------------------------------------------------------------

def classify_checkpoint(weather: WeatherSample, load_weight_lb: int) -> RiskAssessment:
    """Classify risk at a single checkpoint given weather and load weight.

    Steps:
      1. Compute per-phenomenon levels (wind uses load rules).
      2. level  = max(wind_level, rain_level, snow_level)                (D-05)
      3. driver = first of [WIND, RAIN, SNOW] whose level equals `level` (tie-break)
    """
    wind_level, load_rule = apply_load_rules(weather.wind_mph, load_weight_lb)
    rain_level = classify_rain(weather.rain_in_hr)
    snow_level = classify_snow(weather.snow_in_hr)

    level = max(wind_level, rain_level, snow_level)

    # Tie-break order: WIND > RAIN > SNOW (D-05)
    if wind_level == level:
        driver = WeatherDriver.WIND
    elif rain_level == level:
        driver = WeatherDriver.RAIN
    else:
        driver = WeatherDriver.SNOW

    return RiskAssessment(
        level=level,
        wind_level=wind_level,
        rain_level=rain_level,
        snow_level=snow_level,
        driver=driver,
        load_rule=load_rule,
    )
