"""Route ranking and recommendation for Spotter Truck Routing.

Implements Section 13.2 of ARCHITECTURE.md:
  - Lexicographic sort key (D-19):
      (round(no_travel_miles, 1),
       round(severe_miles, 1),
       round(high_miles, 1),
       round(avg_risk, 2),
       round(buffered_duration_s / 60))
  - Output: ranking list, recommended_route_id, status (OK | OK_WITH_WARNING),
    and 1 to 3 human-readable reasons explaining the recommendation.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from domain.enums import RiskLevel
from domain.models import RouteSummary


@dataclass(frozen=True, slots=True)
class RankedRouteItem:
    """A ranked route entry with its 5-element comparison key."""

    route_id: str
    key: tuple[float, float, float, float, int]


@dataclass(frozen=True, slots=True)
class RouteRankingResult:
    """Complete recommendation result for a planned trip."""

    recommended_route_id: str
    status: str  # "OK" | "OK_WITH_WARNING"
    reasons: list[str]
    ranking: list[RankedRouteItem]

    @property
    def route_id(self) -> str:
        """Alias for recommended_route_id matching Section 15 JSON schema."""
        return self.recommended_route_id


def route_sort_key(summary: RouteSummary) -> tuple[float, float, float, float, int]:
    """Compute the 5-element lexicographic sort key (D-19, Section 13.2)."""
    nt_miles = round(summary.miles_by_level.get(RiskLevel.NO_TRAVEL, 0.0), 1)
    sev_miles = round(summary.miles_by_level.get(RiskLevel.SEVERE, 0.0), 1)
    high_miles = round(summary.miles_by_level.get(RiskLevel.HIGH, 0.0), 1)
    avg_risk = round(summary.avg_risk, 2)
    duration_min = round(summary.buffered_duration_s / 60)
    return (nt_miles, sev_miles, high_miles, avg_risk, duration_min)


def _format_miles(miles: float) -> str:
    """Format mileage for human-readable reasons (e.g. 0, 42.5, 73.3)."""
    return f"{int(miles)}" if miles == int(miles) else f"{miles:.1f}"


def _default_label(route_id: str) -> str:
    """Default label for HERE route identifiers (route-1 -> Route A, etc.)."""
    mapping = {
        "route-1": "Route A",
        "route-2": "Route B",
        "route-3": "Route C",
    }
    return mapping.get(route_id, route_id.replace("-", " ").title())


def rank_routes(
    summaries: dict[str, RouteSummary] | Sequence[tuple[str, RouteSummary]],
    labels: dict[str, str] | None = None,
) -> RouteRankingResult:
    """Rank routes lexicographically and select recommended route with explanation."""
    if isinstance(summaries, dict):
        items = list(summaries.items())
    else:
        items = list(summaries)

    if not items:
        raise ValueError("At least one route summary is required for ranking")

    label_lookup = labels or {}

    def get_label(rid: str) -> str:
        return label_lookup.get(rid, _default_label(rid))

    # Calculate keys and sort
    scored = [(rid, summary, route_sort_key(summary)) for rid, summary in items]
    scored.sort(key=lambda item: item[2])

    best_id, best_summary, best_key = scored[0]
    best_label = get_label(best_id)

    # Status: OK_WITH_WARNING if recommended route has no_travel > 0 or severe > 0
    has_warning = (
        best_summary.miles_by_level.get(RiskLevel.NO_TRAVEL, 0.0) > 0.0
        or best_summary.miles_by_level.get(RiskLevel.SEVERE, 0.0) > 0.0
    )
    status = "OK_WITH_WARNING" if has_warning else "OK"

    reasons: list[str] = []

    # D-08: When recommended route crosses No Travel, first reason states this
    if best_summary.miles_by_level.get(RiskLevel.NO_TRAVEL, 0.0) > 0.0:
        reasons.append("Every route crosses No Travel conditions; this is the least bad option.")

    if len(scored) == 1:
        reasons.append("Only one route was available.")
    else:
        runner_id, _runner_summary, runner_key = scored[1]
        runner_label = get_label(runner_id)

        nt1, sev1, high1, avg1, dur1 = best_key
        nt2, sev2, high2, avg2, dur2 = runner_key

        if nt1 < nt2:
            reasons.append(
                f"{best_label} has {_format_miles(nt1)} No Travel miles vs "
                f"{_format_miles(nt2)} for {runner_label}."
            )
        elif sev1 < sev2:
            reasons.append(
                f"{best_label} has {_format_miles(sev1)} Severe miles vs "
                f"{_format_miles(sev2)} for {runner_label}."
            )
        elif high1 < high2:
            reasons.append(
                f"{best_label} has {_format_miles(high1)} High miles vs "
                f"{_format_miles(high2)} for {runner_label}."
            )
        elif avg1 < avg2:
            reasons.append(
                f"Routes tie on severe and high weather risk; {best_label} "
                f"has lower average risk ({avg1:.2f} vs {avg2:.2f})."
            )
        elif dur1 < dur2:
            diff_min = dur2 - dur1
            reasons.append(
                f"Routes tie on weather risk; {best_label} is {diff_min} min faster."
            )
        else:
            reasons.append(
                f"{best_label} and {runner_label} have identical risk and travel time."
            )

    ranking = [RankedRouteItem(route_id=rid, key=k) for rid, _, k in scored]

    return RouteRankingResult(
        recommended_route_id=best_id,
        status=status,
        reasons=reasons[:3],
        ranking=ranking,
    )
