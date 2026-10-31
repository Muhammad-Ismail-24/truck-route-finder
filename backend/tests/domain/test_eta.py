"""Tests for domain/eta.py.

Covers:
  - calculate_buffered_duration with default and custom buffers (D-11)
  - compute_eta: linear interpolation by distance, timezone-aware UTC (D-10)
  - nearest_forecast_hour: :29/:30 rounding edge cases and midnight crossings
"""

from datetime import datetime, timedelta, timezone

import pytest

from domain.constants import DELAY_BUFFER_DEFAULT
from domain.eta import (
    calculate_buffered_duration,
    compute_eta,
    nearest_forecast_hour,
)

UTC = timezone.utc


class TestBufferedDuration:
    def test_default_delay_buffer_is_1_10(self):
        """D-11 default buffer is 1.10."""
        assert DELAY_BUFFER_DEFAULT == 1.10
        buffered = calculate_buffered_duration(10_000.0)
        assert buffered == 11_000.0

    def test_custom_delay_buffer(self):
        buffered = calculate_buffered_duration(10_000.0, delay_buffer=1.25)
        assert buffered == 12_500.0


class TestComputeEta:
    def setup_method(self):
        self.departure = datetime(2026, 11, 2, 8, 0, 0, tzinfo=UTC)
        self.total_miles = 100.0
        self.buffered_duration_s = 3600.0 * 2  # 2 hours

    def test_eta_at_mile_zero_is_departure(self):
        eta = compute_eta(self.departure, 0.0, self.total_miles, self.buffered_duration_s)
        assert eta == self.departure
        assert eta.tzinfo == UTC

    def test_eta_at_destination_is_departure_plus_duration(self):
        eta = compute_eta(
            self.departure, self.total_miles, self.total_miles, self.buffered_duration_s
        )
        expected = self.departure + timedelta(seconds=self.buffered_duration_s)
        assert eta == expected
        assert eta.tzinfo == UTC

    def test_eta_at_halfway_is_half_duration(self):
        eta = compute_eta(
            self.departure, 50.0, self.total_miles, self.buffered_duration_s
        )
        expected = self.departure + timedelta(seconds=self.buffered_duration_s / 2)
        assert eta == expected

    def test_naive_departure_raises_error(self):
        naive_dep = datetime(2026, 11, 2, 8, 0, 0)
        with pytest.raises(ValueError, match="timezone-aware"):
            compute_eta(naive_dep, 10.0, 100.0, 3600.0)

    def test_zero_total_miles_returns_departure(self):
        eta = compute_eta(self.departure, 0.0, 0.0, self.buffered_duration_s)
        assert eta == self.departure


class TestNearestForecastHour:
    """forecast_hour_utc = floor_to_hour(eta + 30 minutes)."""

    def test_exact_hour_rounds_to_same_hour(self):
        eta = datetime(2026, 11, 2, 12, 0, 0, tzinfo=UTC)
        assert nearest_forecast_hour(eta) == datetime(2026, 11, 2, 12, 0, 0, tzinfo=UTC)

    def test_29_minutes_rounds_down(self):
        """12:29:59 + 30m = 12:59:59 -> floor -> 12:00:00."""
        eta = datetime(2026, 11, 2, 12, 29, 59, tzinfo=UTC)
        assert nearest_forecast_hour(eta) == datetime(2026, 11, 2, 12, 0, 0, tzinfo=UTC)

    def test_30_minutes_rounds_up(self):
        """12:30:00 + 30m = 13:00:00 -> floor -> 13:00:00."""
        eta = datetime(2026, 11, 2, 12, 30, 0, tzinfo=UTC)
        assert nearest_forecast_hour(eta) == datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)

    def test_30_minutes_and_one_second_rounds_up(self):
        eta = datetime(2026, 11, 2, 12, 30, 1, tzinfo=UTC)
        assert nearest_forecast_hour(eta) == datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)

    def test_59_minutes_rounds_up(self):
        eta = datetime(2026, 11, 2, 12, 59, 59, tzinfo=UTC)
        assert nearest_forecast_hour(eta) == datetime(2026, 11, 2, 13, 0, 0, tzinfo=UTC)

    def test_midnight_crossing_rounds_to_next_day(self):
        """23:35:00 on Day 1 rounds to 00:00:00 on Day 2."""
        eta = datetime(2026, 11, 2, 23, 35, 0, tzinfo=UTC)
        expected = datetime(2026, 11, 3, 0, 0, 0, tzinfo=UTC)
        assert nearest_forecast_hour(eta) == expected

    def test_multi_day_crossings(self):
        """Checkpoints across a 3-day journey remain in UTC."""
        departure = datetime(2026, 11, 2, 10, 0, 0, tzinfo=UTC)
        # 48 hours later at 23:31
        eta_day3 = departure + timedelta(days=2, hours=13, minutes=31)
        # 2026-11-04 23:31:00 UTC -> nearest is 2026-11-05 00:00:00 UTC
        expected = datetime(2026, 11, 5, 0, 0, 0, tzinfo=UTC)
        assert nearest_forecast_hour(eta_day3) == expected

    def test_naive_datetime_raises_error(self):
        naive_dt = datetime(2026, 11, 2, 12, 0, 0)
        with pytest.raises(ValueError, match="timezone-aware"):
            nearest_forecast_hour(naive_dt)
