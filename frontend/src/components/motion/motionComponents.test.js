import { describe, it, expect } from 'vitest';
import { computeCountUpValue } from './CountUp';
import { formatMiles } from '../../lib/format/distance';
import { formatDuration } from '../../lib/format/time';

describe('CountUp Animation & Formatting Logic (Section 25.5)', () => {
  it('returns exact initial value at progress 0', () => {
    expect(computeCountUpValue(0, 1000, 0)).toBe(0);
    expect(computeCountUpValue(50, 200, 0)).toBe(50);
  });

  it('returns exact target value at progress 1 or greater', () => {
    expect(computeCountUpValue(0, 1000, 1)).toBe(1000);
    expect(computeCountUpValue(0, 1000, 1.5)).toBe(1000);
    expect(computeCountUpValue(10, 42.5, 1)).toBe(42.5);
  });

  it('clamps progress below 0 to start value', () => {
    expect(computeCountUpValue(100, 500, -0.2)).toBe(100);
  });

  it('applies cubic ease-out during intermediate progress', () => {
    const from = 0;
    const to = 100;
    const midValue = computeCountUpValue(from, to, 0.5);

    // easeOutCubic(0.5) = 1 - (1 - 0.5)^3 = 1 - 0.125 = 0.875
    // lerp(0, 100, 0.875) = 87.5
    expect(midValue).toBeCloseTo(87.5, 2);
    expect(midValue).toBeGreaterThan(50); // Ease-out moves faster earlier
  });

  it('formats count-up numbers with mileage and duration formatters', () => {
    const distanceFormatter = (n) => formatMiles(n);
    const durationFormatter = (n) => formatDuration(n);

    expect(distanceFormatter(1250.4)).toBe('1,250.4 mi');
    expect(durationFormatter(3660)).toBe('1h 1m');
    expect(durationFormatter(0)).toBe('0m');
  });

  it('formats whole numbers with standard locale string', () => {
    const defaultFormatter = (n) => Math.round(n).toLocaleString('en-US');
    expect(defaultFormatter(42000)).toBe('42,000');
    expect(defaultFormatter(99.4)).toBe('99');
  });
});
