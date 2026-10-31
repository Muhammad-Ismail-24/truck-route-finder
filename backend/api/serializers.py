"""Serializers and input validators for Spotter Truck Routing API.

Implements Section 15.3 and Decisions D-09, D-10 of ARCHITECTURE.md:
  - Coordinate validation: lat in [-90, 90], lng in [-180, 180].
  - Origin and destination at least 1.0 mile apart (haversine_mi).
  - departure_time: timezone-aware ISO-8601 within now - 60 min .. now + 7 days.
  - load_weight_lb: integer 1..80,000 (D-09).
  - checkpoint_interval_miles: in {10, 25, 50}, default 25 (D-01).
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from rest_framework import serializers

from domain.constants import (
    ALLOWED_INTERVALS_MILES,
    DEFAULT_INTERVAL_MILES,
    DEPARTURE_PAST_GRACE_MINUTES,
    MAX_DEPARTURE_DAYS_AHEAD,
    MAX_LOAD_LB,
    MIN_LOAD_LB,
)
from domain.geometry import haversine_mi
from domain.models import LatLng

__all__ = ["CoordinateSerializer", "GeocodeSuggestQuerySerializer", "PlanRequestSerializer"]


class CoordinateSerializer(serializers.Serializer):
    """Geographic coordinate location input."""

    label = serializers.CharField(required=False, default="", max_length=255)
    lat = serializers.FloatField(
        min_value=-90.0,
        max_value=90.0,
        error_messages={
            "min_value": "Latitude must be between -90 and 90 degrees.",
            "max_value": "Latitude must be between -90 and 90 degrees.",
        },
    )
    lng = serializers.FloatField(
        min_value=-180.0,
        max_value=180.0,
        error_messages={
            "min_value": "Longitude must be between -180 and 180 degrees.",
            "max_value": "Longitude must be between -180 and 180 degrees.",
        },
    )


class GeocodeSuggestQuerySerializer(serializers.Serializer):
    """Validation for geocoding autosuggest query parameter."""

    q = serializers.CharField(
        min_length=3,
        max_length=100,
        error_messages={
            "min_length": "Search query must be at least 3 characters long.",
            "max_length": "Search query cannot exceed 100 characters.",
        },
    )


class PlanRequestSerializer(serializers.Serializer):
    """Serializer validating trip planning request input (Section 15.3)."""

    origin = CoordinateSerializer(required=True)
    destination = CoordinateSerializer(required=True)
    departure_time = serializers.DateTimeField(required=True)
    load_weight_lb = serializers.IntegerField(
        min_value=MIN_LOAD_LB,
        max_value=MAX_LOAD_LB,
        error_messages={
            "min_value": f"Load weight must be at least {MIN_LOAD_LB} lb.",
            "max_value": f"Load weight cannot exceed {MAX_LOAD_LB} lb.",
        },
    )
    checkpoint_interval_miles = serializers.IntegerField(
        required=False,
        default=DEFAULT_INTERVAL_MILES,
    )

    def validate_checkpoint_interval_miles(self, value: int) -> int:
        """Validate checkpoint spacing selector: must be 10, 25, or 50 miles (D-01)."""
        if value not in ALLOWED_INTERVALS_MILES:
            allowed_str = ", ".join(str(i) for i in ALLOWED_INTERVALS_MILES)
            raise serializers.ValidationError(
                f"Checkpoint interval must be one of: {allowed_str} miles."
            )
        return value

    def validate_departure_time(self, value: datetime) -> datetime:
        """Validate departure timestamp: timezone-aware and within allowed window (D-10)."""
        raw = (
            self.initial_data.get("departure_time")
            if hasattr(self, "initial_data") and isinstance(self.initial_data, dict)
            else None
        )
        if isinstance(raw, str):
            # Check for timezone offset (+, -, or Z) after the date portion
            time_part = raw[10:]
            if not (raw.endswith("Z") or "+" in time_part or "-" in time_part):
                raise serializers.ValidationError(
                    "departure_time must be an ISO-8601 string with a valid timezone offset."
                )

        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise serializers.ValidationError(
                "departure_time must be an ISO-8601 string with a valid timezone offset."
            )

        # Allow passing mock 'now' in serializer context for deterministic tests
        now_utc = self.context.get("now")
        if now_utc is None:
            now_utc = datetime.now(timezone.utc)
        elif now_utc.tzinfo is None:
            now_utc = now_utc.replace(tzinfo=timezone.utc)

        val_utc = value.astimezone(timezone.utc)
        earliest_allowed = now_utc - timedelta(minutes=DEPARTURE_PAST_GRACE_MINUTES)
        latest_allowed = now_utc + timedelta(days=MAX_DEPARTURE_DAYS_AHEAD)

        if val_utc < earliest_allowed:
            raise serializers.ValidationError(
                f"Departure time cannot be more than {DEPARTURE_PAST_GRACE_MINUTES} minutes "
                "in the past."
            )
        if val_utc > latest_allowed:
            raise serializers.ValidationError(
                f"Departure time cannot be more than {MAX_DEPARTURE_DAYS_AHEAD} days in the future."
            )
        return val_utc

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        """Validate origin and destination are at least 1.0 mile apart (Section 15.3, 18)."""
        origin = attrs.get("origin")
        dest = attrs.get("destination")

        if origin and dest:
            p1 = LatLng(lat=float(origin["lat"]), lng=float(origin["lng"]))
            p2 = LatLng(lat=float(dest["lat"]), lng=float(dest["lng"]))
            distance = haversine_mi(p1, p2)
            if distance < 1.0:
                raise serializers.ValidationError({
                    "destination": [
                        "Origin and destination must be at least 1.0 mile apart."
                    ]
                })

        return attrs
