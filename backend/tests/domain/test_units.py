"""Unit tests for domain.units — pure math, no network calls."""

import pytest

from domain.units import LB_PER_KG, METERS_PER_MILE, lb_to_kg, meters_to_miles, miles_to_meters


class TestMetersToMiles:
    def test_meters_to_miles_one_mile(self):
        """Exactly 1609.344 m must equal exactly 1.0 mi."""
        assert meters_to_miles(1609.344) == pytest.approx(1.0)

    def test_meters_to_miles_zero(self):
        """Zero metres must yield zero miles."""
        assert meters_to_miles(0.0) == pytest.approx(0.0)

    def test_meters_to_miles_five_miles(self):
        """8046.72 m (5 × 1609.344) must equal 5.0 mi."""
        assert meters_to_miles(8046.72) == pytest.approx(5.0)

    def test_meters_to_miles_partial(self):
        """Half a mile in metres should convert correctly."""
        assert meters_to_miles(METERS_PER_MILE / 2) == pytest.approx(0.5)


class TestMilesToMeters:
    def test_miles_to_meters_one_mile(self):
        """1.0 mi must equal 1609.344 m."""
        assert miles_to_meters(1.0) == pytest.approx(1609.344)

    def test_miles_to_meters_zero(self):
        """Zero miles must yield zero metres."""
        assert miles_to_meters(0.0) == pytest.approx(0.0)

    def test_miles_to_meters_roundtrip(self):
        """Converting to metres and back must return the original value."""
        original = 42.195
        assert meters_to_miles(miles_to_meters(original)) == pytest.approx(original)


class TestLbToKg:
    def test_lb_to_kg_one_pound(self):
        """1.0 lb must equal the exact international factor 0.45359237 kg."""
        assert lb_to_kg(1.0) == pytest.approx(LB_PER_KG)

    def test_lb_to_kg_zero(self):
        """Zero pounds must yield zero kg."""
        assert lb_to_kg(0.0) == pytest.approx(0.0)

    def test_lb_to_kg_hundred_pounds(self):
        """100 lb should convert to 45.359237 kg."""
        assert lb_to_kg(100.0) == pytest.approx(45.359237)

    def test_lb_to_kg_truck_tare(self):
        """Default truck tare of 32000 lb should be approximately 14515 kg."""
        assert lb_to_kg(32_000.0) == pytest.approx(32_000.0 * LB_PER_KG)
