/**
 * Distance formatting helpers.
 */

/**
 * Formats miles into a localized string with unit, e.g. "1,003.4 mi"
 * @param {number} miles
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatMiles(miles, decimals = 1) {
  if (miles === null || miles === undefined || isNaN(miles)) {
    return '0 mi';
  }

  const num = Number(miles);
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${formatted} mi`;
}

/**
 * Formats miles as a number string with decimals, e.g. "1,003.4"
 * @param {number} miles
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatMilesValue(miles, decimals = 1) {
  if (miles === null || miles === undefined || isNaN(miles)) {
    return '0.0';
  }

  return Number(miles).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
