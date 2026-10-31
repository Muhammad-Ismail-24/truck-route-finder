import { describe, it, expect } from 'vitest';
import {
  RISK_LEVELS,
  ORDERED_RISK_KEYS,
  ROUTE_COLORS,
  HEATMAP_THRESHOLDS,
  getRiskLevel,
  getRouteColor,
} from './riskLevels';

describe('riskLevels specification (Section 17.7 & 14)', () => {
  it('defines all five risk levels with required properties', () => {
    expect(ORDERED_RISK_KEYS).toEqual(['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL']);

    for (const key of ORDERED_RISK_KEYS) {
      const item = RISK_LEVELS[key];
      expect(item).toBeDefined();
      expect(item.key).toBe(key);
      expect(typeof item.level).toBe('number');
      expect(typeof item.label).toBe('string');
      expect(typeof item.fill).toBe('string');
      expect(typeof item.textColor).toBe('string');
    }
  });

  it('matches exact colors and contrast requirements from Section 17.7', () => {
    expect(RISK_LEVELS.LOW.fill).toBe('#2E9E5B');
    expect(RISK_LEVELS.LOW.textColor).toBe('#111');
    expect(RISK_LEVELS.LOW.outline).toBeNull();

    expect(RISK_LEVELS.MODERATE.fill).toBe('#F2C94C');
    expect(RISK_LEVELS.MODERATE.textColor).toBe('#111');
    expect(RISK_LEVELS.MODERATE.outline).toBeNull();

    expect(RISK_LEVELS.HIGH.fill).toBe('#F2994A');
    expect(RISK_LEVELS.HIGH.textColor).toBe('#111');
    expect(RISK_LEVELS.HIGH.outline).toBeNull();

    expect(RISK_LEVELS.SEVERE.fill).toBe('#EB5757');
    expect(RISK_LEVELS.SEVERE.textColor).toBe('#111');
    expect(RISK_LEVELS.SEVERE.outline).toBeNull();

    // NO_TRAVEL has white text on dark red fill + visible outline on dark surfaces
    expect(RISK_LEVELS.NO_TRAVEL.fill).toBe('#6B1D1D');
    expect(RISK_LEVELS.NO_TRAVEL.textColor).toBe('#fff');
    expect(RISK_LEVELS.NO_TRAVEL.outline).toBe('1px solid rgba(255,255,255,.4)');
  });

  it('getRiskLevel retrieves levels case-insensitively and falls back to LOW', () => {
    expect(getRiskLevel('low')).toBe(RISK_LEVELS.LOW);
    expect(getRiskLevel('SEVERE')).toBe(RISK_LEVELS.SEVERE);
    expect(getRiskLevel('no_travel')).toBe(RISK_LEVELS.NO_TRAVEL);
    expect(getRiskLevel('UNKNOWN')).toBe(RISK_LEVELS.LOW);
    expect(getRiskLevel('')).toBe(RISK_LEVELS.LOW);
    expect(getRiskLevel(null)).toBe(RISK_LEVELS.LOW);
  });

  it('defines correct route colors A, B, and C', () => {
    expect(ROUTE_COLORS.A).toBe('#2F80ED');
    expect(ROUTE_COLORS.B).toBe('#9B51E0');
    expect(ROUTE_COLORS.C).toBe('#00A3A3');
    expect(ROUTE_COLORS['route-1']).toBe('#2F80ED');
    expect(ROUTE_COLORS['route-2']).toBe('#9B51E0');
    expect(ROUTE_COLORS['route-3']).toBe('#00A3A3');

    expect(getRouteColor('Route A')).toBe('#2F80ED');
    expect(getRouteColor('Route B')).toBe('#9B51E0');
    expect(getRouteColor('Route C')).toBe('#00A3A3');
    expect(getRouteColor('route-2')).toBe('#9B51E0');
  });

  it('defines NO_TRAVEL thresholds for heatmap metric normalization', () => {
    expect(HEATMAP_THRESHOLDS.WIND_MPH).toBe(55);
    expect(HEATMAP_THRESHOLDS.RAIN_IN_HR).toBe(1.0);
    expect(HEATMAP_THRESHOLDS.SNOW_IN_HR).toBe(3.0);
    expect(HEATMAP_THRESHOLDS.RISK).toBe(4);
  });
});
