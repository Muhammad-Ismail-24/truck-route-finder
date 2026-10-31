"""Domain dataclasses for Spotter Truck Routing (frozen, slotted, no I/O)."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from domain.enums import RiskLevel, WeatherDriver


@dataclass(frozen=True, slots=True)
class LatLng:
    """A geographic coordinate pair."""

    lat: float
    lng: float


@dataclass(frozen=True, slots=True)
class Place:
    """A geocoded place suggestion with human-readable label and coordinates."""

    label: str
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


@dataclass(frozen=True, slots=True)
class HourlySeries:
    """Hourly forecast series for a single weather grid point."""

    times_utc: list[datetime] | tuple[datetime, ...]
    wind_mph: list[float] | tuple[float, ...]
    wind_gust_mph: list[float] | tuple[float, ...]
    rain_in_hr: list[float] | tuple[float, ...]
    snow_in_hr: list[float] | tuple[float, ...]


@dataclass(frozen=True, slots=True)
class HeatmapPoint:
    """A single heatmap location with 49-hour forecast and risk arrays."""

    lat: float
    lng: float
    risk: list[int]
    wind_mph: list[float]
    rain_in_hr: list[float]
    snow_in_hr: list[float]

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)


@dataclass(frozen=True, slots=True)
class HeatmapResult:
    """Complete 49-hour heatmap result along the trip corridor."""

    start_utc: datetime
    hours: int
    truncated: bool
    points: list[HeatmapPoint]

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)
