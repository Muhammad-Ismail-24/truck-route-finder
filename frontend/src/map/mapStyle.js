/**
 * @file mapStyle.js
 * Map style configuration and fallback handling.
 * Default: OpenFreeMap Positron (light, low-noise vector style).
 * Fallback: OpenFreeMap Liberty.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, Decision D-17, D-31.
 */

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const FALLBACK_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Returns the configured map style URL from environment variables or default.
 * @returns {string}
 */
export function getMapStyleUrl() {
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NEXT_PUBLIC_MAP_STYLE_URL
  ) {
    return process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  }
  return DEFAULT_MAP_STYLE_URL;
}
