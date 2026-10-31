"""ETA calculations and forecast hour rounding for Spotter Truck Routing.

Implements Section 10.3 of ARCHITECTURE.md:
  - calculate_buffered_duration: base_duration_s * DELAY_BUFFER (D-11)
  - compute_eta: linear interpolation by distance over buffered duration (D-10)
  - nearest_forecast_hour: floor_to_hour(eta + 30 minutes)

All datetimes are timezone-aware UTC.
"""

from datetime import datetime, timedelta

from domain.constants import DELAY_BUFFER_DEFAULT


def calculate_buffered_duration(
    base_duration_s: float,
    delay_buffer: float = DELAY_BUFFER_DEFAULT,
) -> float:
    """Calculate truck travel duration including delay buffer (D-11)."""
    return base_duration_s * delay_buffer


def compute_eta(
    departure_utc: datetime,
    mile: float,
    total_miles: float,
    buffered_duration_s: float,
) -> datetime:
    """Compute checkpoint ETA by linear-by-distance interpolation (D-10, D-11)."""
    if departure_utc.tzinfo is None:
        raise ValueError("departure_utc must be timezone-aware")
    if total_miles <= 0.0:
        return departure_utc
    seconds = (mile / total_miles) * buffered_duration_s
    return departure_utc + timedelta(seconds=seconds)


def nearest_forecast_hour(eta_utc: datetime) -> datetime:
    """Round ETA to the nearest UTC hour: floor(eta + 30 minutes)."""
    if eta_utc.tzinfo is None:
        raise ValueError("eta_utc must be timezone-aware")
    plus_30m = eta_utc + timedelta(minutes=30)
    return plus_30m.replace(minute=0, second=0, microsecond=0)
