"""Domain dataclasses for Spotter Truck Routing (frozen, slotted, no I/O)."""

from dataclasses import dataclass
from datetime import datetime

from domain.enums import RiskLevel, WeatherDriver


@dataclass(frozen=True, slots=True)
class LatLng:
    """A geographic coordinate pair."""

    lat: float
    lng: float


@dataclass(frozen=True, slots=True)
class RouteGeometry:
    """Full-resolution geometry returned by the HERE routing client."""

    route_id: str  # "route-1" | "route-2" | "route-3"
    points: tuple[LatLng, ...]  # full resolution
    distance_mi: float
    base_duration_s: float  # from HERE, before delay buffer


@dataclass(frozen=True, slots=True)
class Checkpoint:
    """A sampled point on a route with ETA and forecast hour."""

    index: int
    mile: float  # distance from origin along the route
    position: LatLng
    segment_miles: float  # road stretch owned by this checkpoint (D-06)
    eta_utc: datetime
    forecast_hour_utc: datetime  # eta rounded to the nearest hour


@dataclass(frozen=True, slots=True)
class WeatherSample:
    """Observed or forecast weather values at a checkpoint; all floats, never None."""

    wind_mph: float
    wind_gust_mph: float
    rain_in_hr: float
    snow_in_hr: float


@dataclass(frozen=True, slots=True)
class RiskAssessment:
    """Risk classification for a single checkpoint."""

    level: RiskLevel
    wind_level: RiskLevel
    rain_level: RiskLevel
    snow_level: RiskLevel
    driver: WeatherDriver
    # None | "WIND_55_ANY_LOAD" | "WIND_45_54_OVER_30K" | "WIND_35_44_OVER_40K"
    load_rule: str | None


@dataclass(frozen=True, slots=True)
class RouteSummary:
    """Aggregated statistics for a complete route."""

    distance_miles: float
    base_duration_s: float
    buffered_duration_s: float
    departure_utc: datetime
    arrival_utc: datetime
    miles_by_level: dict[RiskLevel, float]  # all five keys always present
    avg_risk: float
    max_level: RiskLevel
