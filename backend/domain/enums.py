"""Domain enumerations for Spotter Truck Routing."""

from enum import IntEnum, StrEnum


class RiskLevel(IntEnum):
    """Ordered risk levels; higher integer = greater danger."""

    LOW = 1
    MODERATE = 2
    HIGH = 3
    SEVERE = 4
    NO_TRAVEL = 5


# String name (e.g. "SEVERE") is what is serialized to JSON.


class WeatherDriver(StrEnum):
    """Primary weather phenomenon driving a checkpoint's risk level."""

    WIND = "WIND"
    RAIN = "RAIN"
    SNOW = "SNOW"


class HeatmapMetric(StrEnum):
    """The metric displayed on the weather heatmap."""

    RISK = "RISK"
    WIND = "WIND"
    RAIN = "RAIN"
    SNOW = "SNOW"
