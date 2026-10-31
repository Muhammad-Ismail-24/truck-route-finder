import { describe, it, expect } from 'vitest';
import {
  dateTimeLocalToIso,
  formatUtcInBrowserTimezone,
  formatDuration,
  getDefaultDepartureDateTimeLocal,
} from './time';
import { formatMiles, formatMilesValue } from './distance';
import { formatWeight, parseWeight } from './weight';
import { formatWind, formatRain, formatSnow } from './weather';

describe('Format Helpers', () => {
  describe('time.js', () => {
    it('converts datetime-local input string to ISO string with timezone offset', () => {
      const input = '2026-11-02T08:00';
      const result = dateTimeLocalToIso(input);

      // Must start with the datetime and end with an offset ([+-]HH:MM)
      expect(result).toMatch(/^2026-11-02T08:00:00[+-]\d{2}:\d{2}$/);
    });

    it('preserves ISO string already containing offset or Z', () => {
      const iso = '2026-11-02T13:00:00Z';
      expect(dateTimeLocalToIso(iso)).toBe(iso);

      const offsetStr = '2026-11-02T08:00:00-05:00';
      expect(dateTimeLocalToIso(offsetStr)).toBe(offsetStr);
    });

    it('formats UTC ISO timestamp in browser timezone with offset label', () => {
      const utc = '2026-11-02T13:00:00Z';
      const formatted = formatUtcInBrowserTimezone(utc);

      expect(formatted).toMatch(/Nov 2.*\(UTC[+-]?\d*(:\d{2})?\)/);
    });

    it('formats duration in seconds to Xh Ym or Ym', () => {
      expect(formatDuration(57200)).toBe('15h 53m');
      expect(formatDuration(3600)).toBe('1h 0m');
      expect(formatDuration(1800)).toBe('30m');
      expect(formatDuration(0)).toBe('0m');
      expect(formatDuration(null)).toBe('0m');
    });

    it('computes default departure time as YYYY-MM-DDTHH:mm', () => {
      const defaultTime = getDefaultDepartureDateTimeLocal();
      expect(defaultTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });
  });

  describe('distance.js', () => {
    it('formats miles with 1 decimal and thousands separators', () => {
      expect(formatMiles(1003.4)).toBe('1,003.4 mi');
      expect(formatMiles(25)).toBe('25.0 mi');
      expect(formatMiles(0)).toBe('0.0 mi');
      expect(formatMiles(null)).toBe('0 mi');
    });

    it('formats raw miles value without unit', () => {
      expect(formatMilesValue(1003.4)).toBe('1,003.4');
    });
  });

  describe('weight.js', () => {
    it('formats integer lb with thousands separators', () => {
      expect(formatWeight(42000)).toBe('42,000 lb');
      expect(formatWeight('42000')).toBe('42,000 lb');
      expect(formatWeight('42,000')).toBe('42,000 lb');
      expect(formatWeight(0)).toBe('0 lb');
      expect(formatWeight('')).toBe('0 lb');
    });

    it('parses weight strings with commas/spaces into integers', () => {
      expect(parseWeight('42,000')).toBe(42000);
      expect(parseWeight(' 42000 lb ')).toBe(42000);
      expect(parseWeight(80000)).toBe(80000);
      expect(parseWeight('')).toBeNaN();
    });
  });

  describe('weather.js', () => {
    it('formats wind with and without gusts', () => {
      expect(formatWind(12.3)).toBe('12.3 mph');
      expect(formatWind(12.3, 21.0)).toBe('12.3 mph (gust 21.0 mph)');
      // If gust is not greater than sustained, do not show gust
      expect(formatWind(15.0, 15.0)).toBe('15.0 mph');
      expect(formatWind(15.0, 10.0)).toBe('15.0 mph');
    });

    it('formats rain and snow with two decimals', () => {
      expect(formatRain(0.25)).toBe('0.25 in/hr');
      expect(formatRain(0)).toBe('0.00 in/hr');
      expect(formatSnow(0.5)).toBe('0.50 in/hr');
      expect(formatSnow(1.234)).toBe('1.23 in/hr');
    });
  });
});
