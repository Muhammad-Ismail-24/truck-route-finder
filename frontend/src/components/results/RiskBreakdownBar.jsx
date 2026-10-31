'use client';

/**
 * @file RiskBreakdownBar.jsx
 * Stacked horizontal risk breakdown bar displaying miles per risk level.
 * Segments grow from scaleX(0) with origin left, staggered by level.
 * Miles per level are shown as text alongside for accessibility (never color alone).
 *
 * References:
 * ARCHITECTURE.md Section 17.4, 25.5.
 */

import { RISK_LEVELS, ORDERED_RISK_KEYS } from '../../lib/risk/riskLevels';
import { formatMilesValue } from '../../lib/format/distance';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @param {Object} props
 * @param {Record<string, number>} props.milesByLevel Miles mapped by risk level key
 * @param {number} props.totalMiles Total route distance in miles
 * @param {string} [props.className='']
 */
export default function RiskBreakdownBar({ milesByLevel = {}, totalMiles = 0, className = '' }) {
  const isReducedMotion = useReducedMotion();

  // Calculate segment breakdown
  const segments = ORDERED_RISK_KEYS.map((key, index) => {
    const miles = Number(milesByLevel[key] || 0);
    const percentage = totalMiles > 0 ? (miles / totalMiles) * 100 : 0;
    const meta = RISK_LEVELS[key];
    return {
      key,
      miles,
      percentage,
      meta,
      index,
    };
  });

  const activeSegments = segments.filter((s) => s.miles > 0);

  const ariaDescription = activeSegments
    .map((s) => `${formatMilesValue(s.miles, 1)} miles ${s.meta.label}`)
    .join(', ');

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Visual Stacked Bar */}
      <div
        role="progressbar"
        aria-label={`Risk distribution: ${ariaDescription}`}
        aria-valuenow={100}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full h-2.5 rounded-full bg-surface-3 overflow-hidden flex"
      >
        {segments.map((seg) => {
          if (seg.percentage <= 0) return null;

          return (
            <div
              key={seg.key}
              className="h-full relative origin-left"
              style={{
                width: `${seg.percentage}%`,
                backgroundColor: seg.meta.fill,
                outline: seg.meta.outline || undefined,
                animation: isReducedMotion
                  ? 'none'
                  : `risk-segment-grow 600ms cubic-bezier(0.22, 1, 0.36, 1) ${seg.index * 80}ms backwards`,
              }}
              title={`${seg.meta.label}: ${formatMilesValue(seg.miles, 1)} mi (${seg.percentage.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Accessible Text Legend (never color alone) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular text-text-muted">
        {activeSegments.map((seg) => (
          <div key={seg.key} className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: seg.meta.fill,
                outline: seg.meta.outline || undefined,
              }}
              aria-hidden="true"
            />
            <span>
              {`${formatMilesValue(seg.miles, 1)} mi ${seg.meta.label}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
