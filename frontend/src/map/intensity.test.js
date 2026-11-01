import { describe, it, expect } from 'vitest';
import {
  calculateRiskIntensity,
  calculatePerceptualIntensity,
  HEATMAP_THRESHOLDS,
  RISK_LOW_BASELINE_INTENSITY,
} from './intensity';

describe('Heatmap Intensity Mapping Functions', () => {
  describe('calculateRiskIntensity', () => {
    it('maps LOW (0) to positive floor of 0.20', () => {
      expect(calculateRiskIntensity(0)).toBeCloseTo(0.2, 5);
      expect(calculateRiskIntensity(0)).toBe(RISK_LOW_BASELINE_INTENSITY);
    });

    it('maps MODERATE, HIGH, SEVERE, and NO_TRAVEL distinctly and evenly across 0.4 to 1.0', () => {
      expect(calculateRiskIntensity(1)).toBeCloseTo(0.4, 5); // MODERATE
      expect(calculateRiskIntensity(2)).toBeCloseTo(0.6, 5); // HIGH
      expect(calculateRiskIntensity(3)).toBeCloseTo(0.8, 5); // SEVERE
      expect(calculateRiskIntensity(4)).toBeCloseTo(1.0, 5); // NO_TRAVEL
    });

    it('clamps negative, NaN, or out-of-range risk indices', () => {
      expect(calculateRiskIntensity(-1)).toBeCloseTo(0.2, 5);
      expect(calculateRiskIntensity(null)).toBeCloseTo(0.2, 5);
      expect(calculateRiskIntensity(undefined)).toBeCloseTo(0.2, 5);
      expect(calculateRiskIntensity(10)).toBeCloseTo(1.0, 5);
    });
  });

  describe('calculatePerceptualIntensity', () => {
    it('returns exactly 0 for zero or negative values (transparent)', () => {
      expect(calculatePerceptualIntensity(0, HEATMAP_THRESHOLDS.WIND_MPH)).toBe(0);
      expect(calculatePerceptualIntensity(-5, HEATMAP_THRESHOLDS.WIND_MPH)).toBe(0);
      expect(calculatePerceptualIntensity(0, HEATMAP_THRESHOLDS.RAIN_IN_HR)).toBe(0);
      expect(calculatePerceptualIntensity(0, HEATMAP_THRESHOLDS.SNOW_IN_HR)).toBe(0);
      expect(calculatePerceptualIntensity(null, 55)).toBe(0);
    });

    it('applies perceptual square-root scale sqrt(value / threshold) for Wind', () => {
      // 5 mph wind (light wind is softly visible ~0.30)
      expect(calculatePerceptualIntensity(5, 55)).toBeCloseTo(Math.sqrt(5 / 55), 4);

      // Quarter threshold (13.75 mph) gives 0.50
      expect(calculatePerceptualIntensity(13.75, 55)).toBeCloseTo(0.5, 4);

      // Threshold value (55 mph) gives 1.00
      expect(calculatePerceptualIntensity(55, 55)).toBeCloseTo(1.0, 4);

      // Above threshold clamps to 1.00
      expect(calculatePerceptualIntensity(75, 55)).toBe(1.0);
    });

    it('applies perceptual square-root scale sqrt(value / threshold) for Rain', () => {
      // 0.25 in/hr is quarter of 1.0 in/hr -> gives 0.50
      expect(calculatePerceptualIntensity(0.25, 1.0)).toBeCloseTo(0.5, 4);

      // 1.0 in/hr threshold gives 1.0
      expect(calculatePerceptualIntensity(1.0, 1.0)).toBeCloseTo(1.0, 4);

      // Above threshold clamps to 1.0
      expect(calculatePerceptualIntensity(2.5, 1.0)).toBe(1.0);
    });

    it('applies perceptual square-root scale sqrt(value / threshold) for Snow', () => {
      // 0.75 in/hr is quarter of 3.0 in/hr -> gives 0.50
      expect(calculatePerceptualIntensity(0.75, 3.0)).toBeCloseTo(0.5, 4);

      // 3.0 in/hr threshold gives 1.0
      expect(calculatePerceptualIntensity(3.0, 3.0)).toBeCloseTo(1.0, 4);

      // Above threshold clamps to 1.0
      expect(calculatePerceptualIntensity(5.0, 3.0)).toBe(1.0);
    });
  });

  describe('HEATMAP_THRESHOLDS constants', () => {
    it('matches Section 9 and Section 14 specifications exactly', () => {
      expect(HEATMAP_THRESHOLDS.RISK).toBe(4);
      expect(HEATMAP_THRESHOLDS.WIND_MPH).toBe(55);
      expect(HEATMAP_THRESHOLDS.RAIN_IN_HR).toBe(1.0);
      expect(HEATMAP_THRESHOLDS.SNOW_IN_HR).toBe(3.0);
    });
  });
});
