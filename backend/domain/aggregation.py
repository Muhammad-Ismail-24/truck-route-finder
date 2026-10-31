"""Route summary aggregation for Spotter Truck Routing.

Implements Section 13.1 of ARCHITECTURE.md:
  - summarize_route: aggregates checkpoint weather and risk evaluations into
    a RouteSummary with all five RiskLevel keys in miles_by_level,
    mile-weighted average risk (D-07), and maximum risk level.
"""

from collections.abc import Sequence
from datetime import datetime

from domain.enums import RiskLevel
from domain.models import Checkpoint, RiskAssessment, RouteSummary


def summarize_route(
    checkpoints: Sequence[Checkpoint],
    risks: Sequence[RiskAssessment],
    base_duration_s: float,
    buffered_duration_s: float,
    departure_utc: datetime,
) -> RouteSummary:
    """Aggregate checkpoint weather and risk evaluations into a RouteSummary."""
    # All five RiskLevel keys must always be present (Section 13.1)
    miles_by_level: dict[RiskLevel, float] = {lvl: 0.0 for lvl in RiskLevel}

    if not checkpoints or not risks:
        return RouteSummary(
            distance_miles=0.0,
            base_duration_s=base_duration_s,
            buffered_duration_s=buffered_duration_s,
            departure_utc=departure_utc,
            arrival_utc=departure_utc,
            miles_by_level=miles_by_level,
            avg_risk=1.0,
            max_level=RiskLevel.LOW,
        )

    total_miles = 0.0
    weighted_risk_sum = 0.0
    max_level = RiskLevel.LOW

    for cp, risk in zip(checkpoints, risks, strict=False):
        seg_mi = cp.segment_miles
        total_miles += seg_mi
        miles_by_level[risk.level] += seg_mi
        weighted_risk_sum += int(risk.level) * seg_mi
        if risk.level > max_level:
            max_level = risk.level

    avg_risk = weighted_risk_sum / total_miles if total_miles > 0.0 else 1.0
    arrival_utc = checkpoints[-1].eta_utc

    return RouteSummary(
        distance_miles=total_miles,
        base_duration_s=base_duration_s,
        buffered_duration_s=buffered_duration_s,
        departure_utc=departure_utc,
        arrival_utc=arrival_utc,
        miles_by_level=miles_by_level,
        avg_risk=avg_risk,
        max_level=max_level,
    )
