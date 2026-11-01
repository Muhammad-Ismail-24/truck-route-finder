/**
 * @file intensity.js
 * Intensity mapping functions for the GPU weather and risk forecast heatmap.
 *
 * Rules:
 * - RISK mode: maps LOW (0) to a visible baseline floor (0.2), scaling MODERATE..NO_TRAVEL (1..4)
 *   smoothly across [0.4, 1.0] so all risk tiers remain clearly distinct.
 * - WIND, RAIN, SNOW modes: uses a perceptual square-root scale sqrt(clamp(val / threshold, 0, 1))
 *   so light conditions (5-15 mph wind, light rain/snow) are visible while remaining weaker
 *   than near-threshold values. Zero values remain 0 (transparent).
 *
 * References:
 * ARCHITECTURE.md Section 14, Decisions D-20, D-42.
 */

export const HEATMAP_THRESHOLDS = {
  RISK: 4,
  WIND_MPH: 55,
  RAIN_IN_HR: 1.0,
  SNOW_IN_HR: 3.0,
};

export const RISK_LOW_BASELINE_INTENSITY = 0.2;

/**
 * Calculates normalized intensity for Risk level (0..4).
 * Maps LOW (0) to a positive floor (0.20), and scales MODERATE..NO_TRAVEL (1..4)
 * evenly across [0.40, 1.00] in steps of 0.20.
 *
 * @param {number} riskIndex 0 (LOW) to 4 (NO_TRAVEL)
 * @returns {number} intensity in [0.20, 1.00]
 */
export function calculateRiskIntensity(riskIndex) {
  const num = Number(riskIndex);
  const clamped = Math.max(0, Math.min(4, isNaN(num) ? 0 : Math.round(num)));
  return 0.2 + 0.8 * (clamped / 4);
}

/**
 * Calculates perceptual intensity for continuous weather metrics using a sqrt scale.
 * Zero values return 0 (transparent).
 * Positive values are mapped through sqrt(clamp(value / threshold, 0, 1)).
 *
 * @param {number} value Weather value (mph or in/hr)
 * @param {number} threshold NO_TRAVEL threshold (55 for wind, 1.0 for rain, 3.0 for snow)
 * @returns {number} intensity in [0.0, 1.0]
 */
export function calculatePerceptualIntensity(value, threshold) {
  const num = Number(value);
  if (isNaN(num) || num <= 0 || !threshold || threshold <= 0) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(1, num / threshold));
  return Math.sqrt(ratio);
}
