/**
 * Time formatting and timezone conversion utilities.
 */

/**
 * Converts a datetime-local input string (e.g. "2026-11-02T08:00")
 * to a full ISO-8601 string including the browser's local timezone offset.
 *
 * @param {string | Date} input
 * @returns {string} ISO-8601 formatted string with offset, e.g. "2026-11-02T08:00:00-05:00"
 */
export function dateTimeLocalToIso(input) {
  if (!input) return '';

  if (input instanceof Date) {
    return dateToIsoWithOffset(input);
  }

  const str = String(input).trim();
  // If it already has an offset or Z, parse and return
  if (/[Z+-]\d{2}(:\d{2})?$/i.test(str) || str.endsWith('Z')) {
    return str;
  }

  // Parse local components: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
  const [datePart, timePart = '00:00'] = str.split('T');
  if (!datePart) return '';

  const [year, month, day] = datePart.split('-').map(Number);
  const timeSegments = timePart.split(':').map(Number);
  const hours = timeSegments[0] || 0;
  const minutes = timeSegments[1] || 0;
  const seconds = timeSegments[2] || 0;

  const localDate = new Date(year, month - 1, day, hours, minutes, seconds);
  return dateToIsoWithOffset(localDate);
}

/**
 * Helper to produce ISO string with offset from Date object.
 * @param {Date} date
 * @returns {string}
 */
export function dateToIsoWithOffset(date) {
  const pad = (n) => String(n).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMins}`;
}

/**
 * Returns formatted offset label for a given Date, e.g. "UTC-5" or "UTC+5:30" or "UTC"
 * @param {Date} date
 * @returns {string}
 */
export function getTimezoneOffsetLabel(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  if (offsetMinutes === 0) return 'UTC';

  const sign = offsetMinutes > 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;

  if (mins === 0) {
    return `UTC${sign}${hours}`;
  }
  return `UTC${sign}${hours}:${String(mins).padStart(2, '0')}`;
}

/**
 * Formats a UTC timestamp string in the browser's time zone with an offset label.
 * Example: "Nov 2, 8:00 AM (UTC-5)"
 *
 * @param {string | Date} utcInput
 * @param {{ includeDate?: boolean, includeSeconds?: boolean }} [options]
 * @returns {string}
 */
export function formatUtcInBrowserTimezone(utcInput, { includeDate = true, includeSeconds = false } = {}) {
  if (!utcInput) return '';

  const date = typeof utcInput === 'string' ? new Date(utcInput) : utcInput;
  if (isNaN(date.getTime())) return '';

  const offsetLabel = getTimezoneOffsetLabel(date);

  /** @type {Intl.DateTimeFormatOptions} */
  const formatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  if (includeSeconds) {
    formatOptions.second = '2-digit';
  }

  if (includeDate) {
    formatOptions.month = 'short';
    formatOptions.day = 'numeric';
  }

  const formattedDateTime = new Intl.DateTimeFormat('en-US', formatOptions).format(date);
  return `${formattedDateTime} (${offsetLabel})`;
}

/**
 * Formats seconds into human-readable duration, e.g. "15h 53m"
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return '0m';
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Computes default departure datetime-local value (top of the next hour).
 * Format: "YYYY-MM-DDTHH:mm"
 * @returns {string}
 */
export function getDefaultDepartureDateTimeLocal() {
  const nextHour = new Date();
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, '0');
  const year = nextHour.getFullYear();
  const month = pad(nextHour.getMonth() + 1);
  const day = pad(nextHour.getDate());
  const hours = pad(nextHour.getHours());
  const minutes = pad(nextHour.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
