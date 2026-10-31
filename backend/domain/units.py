"""Unit-conversion helpers for Spotter Truck Routing (pure math, no I/O)."""

METERS_PER_MILE: float = 1609.344
LB_PER_KG: float = 0.45359237


def meters_to_miles(meters: float) -> float:
    """Convert metres to statute miles."""
    return meters / METERS_PER_MILE


def miles_to_meters(miles: float) -> float:
    """Convert statute miles to metres."""
    return miles * METERS_PER_MILE


def lb_to_kg(pounds: float) -> float:
    """Convert pounds to kilograms using the exact international factor (D-24)."""
    return pounds * LB_PER_KG
