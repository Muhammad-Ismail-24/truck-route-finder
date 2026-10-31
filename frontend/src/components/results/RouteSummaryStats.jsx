'use client';

/**
 * @file RouteSummaryStats.jsx
 * Summary metrics grid for a RouteCard.
 * Uses CountUp for distance, duration, and average risk.
 *
 * References:
 * ARCHITECTURE.md Section 17.4, 25.5.
 */

import CountUp from '../motion/CountUp';
import RiskBadge from './RiskBadge';
import { formatMiles } from '../../lib/format/distance';
import { formatDuration, formatUtcInBrowserTimezone } from '../../lib/format/time';

/**
 * @param {Object} props
 * @param {import('../../lib/types').RouteSummary} props.summary
 * @param {string} [props.className='']
 */
export default function RouteSummaryStats({ summary, className = '' }) {
  if (!summary) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Top Row: Distance, Travel Time, Max Level */}
      <div className="grid grid-cols-3 gap-2 text-left">
        {/* Distance */}
        <div className="bg-surface-2/60 border border-border-subtle/50 rounded-xl p-2.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-faint block mb-0.5">
            Distance
          </span>
          <span className="font-mono tabular text-sm font-semibold text-white">
            <CountUp
              value={summary.distance_miles || 0}
              formatter={(val) => formatMiles(val, 1)}
            />
          </span>
        </div>

        {/* Buffered Duration */}
        <div className="bg-surface-2/60 border border-border-subtle/50 rounded-xl p-2.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-faint block mb-0.5">
            Est. Time
          </span>
          <span className="font-mono tabular text-sm font-semibold text-white">
            <CountUp
              value={summary.buffered_duration_s || 0}
              formatter={(val) => formatDuration(val)}
            />
          </span>
        </div>

        {/* Max Risk Level */}
        <div className="bg-surface-2/60 border border-border-subtle/50 rounded-xl p-2.5 flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-faint block mb-0.5">
            Peak Risk
          </span>
          <div>
            <RiskBadge level={summary.max_level} size="sm" />
          </div>
        </div>
      </div>

      {/* Middle Row: Departure → Arrival Times */}
      <div className="flex items-center justify-between text-xs font-mono tabular text-text-muted bg-surface-2/30 px-3 py-1.5 rounded-lg border border-border-subtle/30">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-text-faint">Dep:</span>
          <span className="text-text-primary">
            {formatUtcInBrowserTimezone(summary.departure_utc, { includeDate: false })}
          </span>
        </div>
        <span className="text-text-faint">→</span>
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-text-faint">Arr:</span>
          <span className="text-text-primary">
            {formatUtcInBrowserTimezone(summary.arrival_utc, { includeDate: false })}
          </span>
        </div>
      </div>

      {/* Bottom Metric: Average Risk Score */}
      <div className="flex items-center justify-between text-xs pt-0.5">
        <span className="text-text-muted text-[11px] font-body">
          Avg Risk Score:
        </span>
        <span className="font-mono tabular font-medium text-text-primary">
          <CountUp
            value={summary.avg_risk || 1.0}
            formatter={(val) => val.toFixed(2)}
          />{' '}
          <span className="text-text-faint text-[10px]">/ 5.00</span>
        </span>
      </div>
    </div>
  );
}
