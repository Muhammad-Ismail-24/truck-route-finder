'use client';

/**
 * @file LoadWeightInput.jsx
 * Integer input for cargo load weight (1 – 80,000 lb).
 * Formats with thousands separators on blur, displays raw digits while editing.
 * Explains active load-rule wind thresholds (Section 9.2, D-09).
 *
 * References:
 * ARCHITECTURE.md Section 9.2, 17.3, 17.7, Decision D-09.
 */

import { useState } from 'react';
import { parseWeight } from '../../lib/format/weight';
import {
  MIN_LOAD_LB,
  MAX_LOAD_LB,
  LOAD_RULE_30K_LB,
  LOAD_RULE_40K_LB,
  WIND_NO_TRAVEL_THRESHOLD_MPH,
  WIND_SEVERE_MIN_MPH,
  WIND_SEVERE_MAX_MPH,
  WIND_HIGH_MIN_MPH,
  WIND_HIGH_MAX_MPH,
} from '../../lib/constants';

/**
 * Computes dynamic load rule helper text per Section 9.3 and Decision D-09.
 *
 * Rules:
 *   - up to 30,000 lb: "Wind of 55 mph or more is No Travel."
 *   - above 30,000 up to 40,000 lb: "Wind 45-54 mph is No Travel for this load. 55 mph or more is No Travel."
 *   - above 40,000 lb: "Wind 45-54 mph is No Travel; wind 35-44 mph is Severe for this load. 55 mph or more is No Travel."
 *
 * @param {number} weight
 * @returns {string}
 */
export function getLoadRuleHelperText(weight) {
  if (weight > LOAD_RULE_40K_LB) {
    return `Wind ${WIND_SEVERE_MIN_MPH}-${WIND_SEVERE_MAX_MPH} mph is No Travel; wind ${WIND_HIGH_MIN_MPH}-${WIND_HIGH_MAX_MPH} mph is Severe for this load. ${WIND_NO_TRAVEL_THRESHOLD_MPH} mph or more is No Travel.`;
  }
  if (weight > LOAD_RULE_30K_LB) {
    return `Wind ${WIND_SEVERE_MIN_MPH}-${WIND_SEVERE_MAX_MPH} mph is No Travel for this load. ${WIND_NO_TRAVEL_THRESHOLD_MPH} mph or more is No Travel.`;
  }
  return `Wind of ${WIND_NO_TRAVEL_THRESHOLD_MPH} mph or more is No Travel.`;
}

/**
 * Validates weight boundaries and generates dynamic load-rule tier text (D-09).
 * @param {number} weight
 * @returns {{ isValid: boolean, error?: string, tierMessage?: string }}
 */
export function validateLoadWeight(weight) {
  if (weight === null || weight === undefined || isNaN(weight) || weight === 0) {
    return { isValid: false, error: 'Load weight is required' };
  }

  if (weight < MIN_LOAD_LB) {
    return { isValid: false, error: `Weight must be at least ${MIN_LOAD_LB} lb` };
  }

  if (weight > MAX_LOAD_LB) {
    return {
      isValid: false,
      error: `Weight cannot exceed ${MAX_LOAD_LB.toLocaleString('en-US')} lb (gross federal limit)`,
    };
  }

  return { isValid: true, tierMessage: getLoadRuleHelperText(weight) };
}

/**
 * @param {Object} props
 * @param {string} [props.id='load-weight-input']
 * @param {number} props.value
 * @param {(val: number) => void} props.onChange
 * @param {string} [props.error]
 */
export default function LoadWeightInput({
  id = 'load-weight-input',
  value,
  onChange,
  error: externalError,
}) {
  const [editingText, setEditingText] = useState(null);

  const displayValue =
    editingText !== null
      ? editingText
      : value
      ? Number(value).toLocaleString('en-US')
      : '';

  const handleFocus = () => {
    setEditingText(value ? String(value) : '');
  };

  const handleBlur = () => {
    if (editingText !== null) {
      const parsed = parseWeight(editingText);
      if (!isNaN(parsed) && parsed > 0) {
        onChange(parsed);
      } else {
        onChange(NaN);
      }
      setEditingText(null);
    }
  };

  const handleChange = (e) => {
    const inputVal = e.target.value.replace(/[^0-9]/g, '');
    setEditingText(inputVal);
    const parsed = parseInt(inputVal, 10);
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  const validation = validateLoadWeight(value);
  const activeError = externalError || (!validation.isValid ? validation.error : null);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="font-body text-xs uppercase tracking-wider text-text-muted font-medium"
        >
          Cargo Load Weight
        </label>
        <span className="font-mono text-[11px] text-text-muted tabular">
          Max: 80,000 lb
        </span>
      </div>

      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="e.g. 40,000"
          className={`w-full bg-surface-2 border rounded-xl px-4 py-3 pr-12 min-h-[44px] text-sm font-mono text-white transition-all duration-150 focus:outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt focus:ring-offset-2 focus:ring-offset-ink tabular ${
            activeError
              ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500'
              : 'border-border-subtle'
          }`}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-text-muted pointer-events-none tabular">
          lb
        </span>
      </div>

      {/* Validation error or risk rule tier helper (reserved 2 lines with mono tabular numerals) */}
      <div className="min-h-[2.5rem] mt-0.5">
        {activeError ? (
          <p className="text-xs text-red-400 font-body flex items-center gap-1">
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
        ) : (
          <p className="text-[11px] text-text-muted font-mono tabular leading-normal">
            {validation.tierMessage}
          </p>
        )}
      </div>
    </div>
  );
}
