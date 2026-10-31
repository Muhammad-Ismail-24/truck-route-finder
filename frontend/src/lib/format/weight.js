/**
 * Weight formatting and parsing helpers.
 */

/**
 * Formats pounds (lb) with thousands separators, e.g. "42,000 lb"
 * @param {number | string} weightLb
 * @returns {string}
 */
export function formatWeight(weightLb) {
  if (weightLb === null || weightLb === undefined || weightLb === '') {
    return '0 lb';
  }

  const num = typeof weightLb === 'number' ? weightLb : parseWeight(weightLb);
  if (isNaN(num)) return '0 lb';

  return `${Math.round(num).toLocaleString('en-US')} lb`;
}

/**
 * Parses user weight input into an integer, removing commas/spaces.
 * Returns NaN if unparseable.
 * @param {string | number} input
 * @returns {number}
 */
export function parseWeight(input) {
  if (typeof input === 'number') return Math.round(input);
  if (!input) return NaN;

  const cleaned = String(input).replace(/[^0-9]/g, '');
  if (!cleaned) return NaN;

  return parseInt(cleaned, 10);
}
