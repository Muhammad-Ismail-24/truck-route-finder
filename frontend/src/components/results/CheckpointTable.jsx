'use client';

/**
 * @file CheckpointTable.jsx
 * Compact two-line list of sampled checkpoints along the selected route.
 * Line 1: Mile (mono), Risk badge, ETA
 * Line 2: Wind (gust), Rain, Snow in mono tabular numerals.
 * Zero horizontal scrolling at 440px sidebar width.
 * Features a sticky header, selected row highlighting, and click-to-select interaction.
 *
 * References:
 * ARCHITECTURE.md Section 17.4, 25.5.
 */

import { formatMilesValue } from '../../lib/format/distance';
import { formatUtcInBrowserTimezone } from '../../lib/format/time';
import { formatWind, formatRain, formatSnow } from '../../lib/format/weather';
import RiskBadge from './RiskBadge';

/**
 * @param {Object} props
 * @param {import('../../lib/types').Route} props.route Currently selected route
 * @param {string | null} props.selectedCheckpointKey e.g. "route-1:3"
 * @param {(key: string) => void} props.onSelectCheckpoint
 */
export default function CheckpointTable({
  route,
  selectedCheckpointKey,
  onSelectCheckpoint,
}) {
  if (!route || !Array.isArray(route.checkpoints) || route.checkpoints.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-surface-2 text-center text-xs text-text-muted">
        No checkpoints available for this route.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-1 overflow-hidden shadow-lg">
      {/* Table Header Bar */}
      <div className="p-3.5 bg-surface-2/80 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-display text-sm uppercase tracking-wide text-white">
            CHECKPOINT LOG
          </h4>
          <span className="text-[11px] font-mono tabular text-text-muted">
            ({route.checkpoints.length} sampled points)
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          Click row to inspect
        </span>
      </div>

      {/* Sticky Sub-Header Column Labels */}
      <div className="sticky top-0 z-10 bg-surface-2 border-b border-border-subtle px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-text-muted flex items-center justify-between select-none">
        <span>Mile · Risk · ETA</span>
        <span>Wind (Gust) · Rain · Snow</span>
      </div>

      {/* Scrollable Viewport without horizontal scrollbar */}
      <div className="max-h-[340px] overflow-y-auto overflow-x-hidden divide-y divide-border-subtle/30">
        {route.checkpoints.map((cp) => {
          const key = `${route.id}:${cp.index}`;
          const isSelected = selectedCheckpointKey === key;

          return (
            <div
              key={key}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              onClick={() => onSelectCheckpoint(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectCheckpoint(key);
                }
              }}
              className={`p-2.5 px-3 transition-colors select-none cursor-pointer focus:outline-none focus:bg-surface-3 focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-inset ${
                isSelected
                  ? 'bg-cobalt/20 hover:bg-cobalt/25 text-white font-medium border-l-2 border-l-cobalt'
                  : 'hover:bg-surface-2/60 text-text-muted'
              }`}
            >
              {/* Line 1: Mile (mono) + Risk badge + ETA */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular font-semibold text-white text-xs">
                    {formatMilesValue(cp.mile, 1)} mi
                  </span>
                  <RiskBadge level={cp.risk?.level} size="sm" />
                </div>
                <span className="font-mono tabular text-[11px] text-text-primary">
                  {formatUtcInBrowserTimezone(cp.eta_utc, { includeDate: false })}
                </span>
              </div>

              {/* Line 2: Wind (gust), Rain, Snow in mono tabular numerals */}
              <div className="flex items-center justify-between text-[11px] font-mono tabular gap-2 text-text-muted">
                <span className="text-text-primary truncate">
                  {formatWind(cp.weather?.wind_mph, cp.weather?.wind_gust_mph)}
                </span>
                <div className="flex items-center gap-2.5 flex-shrink-0 text-text-muted">
                  <span>
                    <span className="text-text-faint">Rain: </span>
                    {formatRain(cp.weather?.rain_in_hr)}
                  </span>
                  <span>
                    <span className="text-text-faint">Snow: </span>
                    {formatSnow(cp.weather?.snow_in_hr)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
