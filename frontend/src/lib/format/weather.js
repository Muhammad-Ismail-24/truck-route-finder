/**
 * Weather formatting helpers.
 */

/**
 * Formats sustained wind speed with optional gusts.
 * Examples: "12.3 mph", "12.3 mph (gust 21.0 mph)"
 *
 * @param {number} windMph
 * @param {number | null} [gustMph]
 * @returns {string}
 */
export function formatWind(windMph, gustMph = null) {
  const windVal = windMph !== null && windMph !== undefined && !isNaN(windMph) ? Number(windMph) : 0;
  const windStr = `${windVal.toFixed(1)} mph`;

  if (gustMph !== null && gustMph !== undefined && !isNaN(gustMph)) {
    const gustVal = Number(gustMph);
    if (gustVal > windVal) {
      return `${windStr} (gust ${gustVal.toFixed(1)} mph)`;
    }
  }

  return windStr;
}

/**
 * Formats precipitation rate (inches per hour).
 * Example: "0.25 in/hr"
 *
 * @param {number} rainInHr
 * @returns {string}
 */
export function formatRain(rainInHr) {
  const val = rainInHr !== null && rainInHr !== undefined && !isNaN(rainInHr) ? Number(rainInHr) : 0;
  return `${val.toFixed(2)} in/hr`;
}

/**
 * Formats snowfall rate (inches per hour).
 * Example: "0.50 in/hr"
 *
 * @param {number} snowInHr
 * @returns {string}
 */
export function formatSnow(snowInHr) {
  const val = snowInHr !== null && snowInHr !== undefined && !isNaN(snowInHr) ? Number(snowInHr) : 0;
  return `${val.toFixed(2)} in/hr`;
}
