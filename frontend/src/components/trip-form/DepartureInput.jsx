'use client';

/**
 * @file DepartureInput.jsx
 * Datetime-local picker defaulting to the next full hour.
 * Displays browser timezone helper text and validates departure window.
 *
 * Allowed Window: now - 60 min to now + 7 days (Section 15.3, D-10).
 * Long-range forecast notice when departure > 5 days away.
 *
 * References:
 * ARCHITECTURE.md Section 15.3, 17.3, 17.7, Decision D-10.
 */

import { useMemo } from 'react';
import { getTimezoneOffsetLabel } from '../../lib/format/time';

/**
 * Validates departure window.
 * @param {string} localIso YYYY-MM-DDTHH:mm
 * @returns {{ isValid: boolean, error?: string, isLongRange?: boolean }}
 */
export function validateDepartureTime(localIso) {
  if (!localIso) {
    return { isValid: false, error: 'Departure time is required' };
  }

  const selectedDate = new Date(localIso);
  if (isNaN(selectedDate.getTime())) {
    return { isValid: false, error: 'Invalid date/time format' };
  }

  const now = Date.now();
  const minTime = now - 60 * 60 * 1000; // now - 60 minutes
  const maxTime = now + 7 * 24 * 60 * 60 * 1000; // now + 7 days
  const longRangeThreshold = now + 5 * 24 * 60 * 60 * 1000; // now + 5 days

  const selectedTime = selectedDate.getTime();

  if (selectedTime < minTime) {
    return {
      isValid: false,
      error: 'Departure cannot be more than 60 minutes in the past',
    };
  }

  if (selectedTime > maxTime) {
    return {
      isValid: false,
      error: 'Departure cannot be more than 7 days in the future',
    };
  }

  return {
    isValid: true,
    isLongRange: selectedTime > longRangeThreshold,
  };
}

/**
 * @param {Object} props
 * @param {string} props.id
 * @param {string} props.value
 * @param {(val: string) => void} props.onChange
 * @param {string} [props.error]
 */
export default function DepartureInput({
  id = 'departure-input',
  value,
  onChange,
  error: externalError,
}) {
  const timezoneInfo = useMemo(() => {
    const date = new Date();
    const offset = getTimezoneOffsetLabel(date);
    const tzName =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : '';
    return { offset, tzName };
  }, []);

  const validation = useMemo(() => validateDepartureTime(value), [value]);
  const activeError = externalError || (!validation.isValid ? validation.error : null);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="font-body text-xs uppercase tracking-wider text-text-muted font-medium"
        >
          Departure Time
        </label>
        <span className="font-mono text-[11px] text-text-muted tabular">
          {timezoneInfo.offset} {timezoneInfo.tzName ? `(${timezoneInfo.tzName})` : ''}
        </span>
      </div>

      <input
        id={id}
        type="datetime-local"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-surface-2 border rounded-xl px-4 py-3 min-h-[44px] text-sm font-mono text-white transition-all duration-150 focus:outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt focus:ring-offset-2 focus:ring-offset-ink tabular [color-scheme:dark] ${
          activeError
            ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500'
            : 'border-border-subtle'
        }`}
      />

      {/* Validation or Helper Messages */}
      {activeError ? (
        <p className="text-xs text-red-400 font-body flex items-center gap-1 mt-0.5">
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{activeError}</span>
        </p>
      ) : validation.isLongRange ? (
        <p className="text-[11px] text-amber-400/90 font-body flex items-center gap-1 mt-0.5">
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Long-range forecast notice: accuracy decreases beyond 5 days.</span>
        </p>
      ) : (
        <p className="text-[11px] text-text-muted font-body mt-0.5">
          Weather forecast will match the estimated arrival hour at each checkpoint.
        </p>
      )}
    </div>
  );
}
