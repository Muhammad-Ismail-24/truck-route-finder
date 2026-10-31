'use client';

/**
 * @file IntervalSelect.jsx
 * Segmented pill control for checkpoint spacing (10, 25, 50 miles).
 * Features a sliding highlight background transform between options.
 *
 * References:
 * ARCHITECTURE.md Section 17.3, 17.7, Decision D-01.
 */

import { useReducedMotion } from '../../hooks/useReducedMotion';

const INTERVAL_OPTIONS = [
  { value: 10, label: '10 mi', desc: 'Detailed' },
  { value: 25, label: '25 mi', desc: 'Balanced' },
  { value: 50, label: '50 mi', desc: 'Fast' },
];

/**
 * @param {Object} props
 * @param {number} [props.value=25]
 * @param {(interval: number) => void} props.onChange
 */
export default function IntervalSelect({ value = 25, onChange }) {
  const isReducedMotion = useReducedMotion();
  const activeIndex = INTERVAL_OPTIONS.findIndex((opt) => opt.value === Number(value));
  const safeIndex = activeIndex >= 0 ? activeIndex : 1; // default to 25 mi

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          id="interval-select-label"
          className="font-body text-xs uppercase tracking-wider text-text-muted font-medium"
        >
          Checkpoint Interval
        </label>
        <span className="font-mono text-[11px] text-text-muted tabular">
          Default: 25 miles
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="interval-select-label"
        className="relative bg-surface-2 border border-border-subtle rounded-xl p-1 flex items-center select-none"
      >
        {/* Sliding Highlight Pill */}
        <div
          className="absolute top-1 bottom-1 left-1 rounded-lg bg-surface-3 border border-border-strong shadow-sm pointer-events-none"
          style={{
            width: 'calc((100% - 8px) / 3)',
            transform: `translateX(${safeIndex * 100}%)`,
            transitionProperty: 'transform',
            transitionDuration: isReducedMotion ? '0ms' : 'var(--motion-base, 280ms)',
            transitionTimingFunction: 'var(--motion-ease, cubic-bezier(0.22, 1, 0.36, 1))',
          }}
        />

        {INTERVAL_OPTIONS.map((opt) => {
          const isSelected = opt.value === Number(value);
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(opt.value)}
              className={`relative z-10 w-1/3 min-h-[44px] py-2 flex items-center justify-center rounded-lg font-mono text-xs font-semibold tabular transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt ${
                isSelected
                  ? 'text-white'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-text-muted font-body mt-0.5">
        Interval dictates frequency of weather forecasts along the route corridor.
      </p>
    </div>
  );
}
