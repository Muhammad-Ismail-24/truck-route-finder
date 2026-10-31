/**
 * Risk levels, theme colors, and thresholds.
 * Source: ARCHITECTURE.md Section 17.7 and Section 14.
 */

export const RISK_LEVELS = {
  LOW: {
    key: 'LOW',
    level: 1,
    label: 'Low',
    fill: '#2E9E5B',
    textColor: '#111',
    outline: null,
  },
  MODERATE: {
    key: 'MODERATE',
    level: 2,
    label: 'Moderate',
    fill: '#F2C94C',
    textColor: '#111',
    outline: null,
  },
  HIGH: {
    key: 'HIGH',
    level: 3,
    label: 'High',
    fill: '#F2994A',
    textColor: '#111',
    outline: null,
  },
  SEVERE: {
    key: 'SEVERE',
    level: 4,
    label: 'Severe',
    fill: '#EB5757',
    textColor: '#111',
    outline: null,
  },
  NO_TRAVEL: {
    key: 'NO_TRAVEL',
    level: 5,
    label: 'No Travel',
    fill: '#6B1D1D',
    textColor: '#fff',
    outline: '1px solid rgba(255,255,255,.4)',
  },
};

/**
 * Ordered list of risk level keys from lowest to highest.
 */
export const ORDERED_RISK_KEYS = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL'];

/**
 * Route polyline colors (Section 17.7).
 */
export const ROUTE_COLORS = {
  'route-1': '#2F80ED',
  'route-2': '#9B51E0',
  'route-3': '#00A3A3',
  A: '#2F80ED',
  B: '#9B51E0',
  C: '#00A3A3',
};

/**
 * NO_TRAVEL thresholds used for heatmap intensity normalization (Section 14).
 */
export const HEATMAP_THRESHOLDS = {
  WIND_MPH: 55,
  RAIN_IN_HR: 1.0,
  SNOW_IN_HR: 3.0,
  RISK: 4,
};

/**
 * Retrieves risk level metadata by string key.
 * @param {string} key - e.g. "LOW", "MODERATE", "HIGH", "SEVERE", "NO_TRAVEL"
 * @returns {typeof RISK_LEVELS.LOW}
 */
export function getRiskLevel(key) {
  if (!key) return RISK_LEVELS.LOW;
  const upper = String(key).toUpperCase();
  return RISK_LEVELS[upper] || RISK_LEVELS.LOW;
}

/**
 * Retrieves color for a route by its ID (route-1) or label (Route A / A).
 * @param {string} routeIdentifier
 * @returns {string} Hex color
 */
export function getRouteColor(routeIdentifier) {
  if (!routeIdentifier) return ROUTE_COLORS['route-1'];
  if (ROUTE_COLORS[routeIdentifier]) return ROUTE_COLORS[routeIdentifier];

  const trimmed = String(routeIdentifier).trim();
  if (trimmed.endsWith('A')) return ROUTE_COLORS.A;
  if (trimmed.endsWith('B')) return ROUTE_COLORS.B;
  if (trimmed.endsWith('C')) return ROUTE_COLORS.C;

  return ROUTE_COLORS['route-1'];
}
