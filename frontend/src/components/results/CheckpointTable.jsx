'use client';

/**
 * @file CheckpointTable.jsx
 * Scrollable table of checkpoints along the selected route.
 * Columns: Mile, ETA, Wind with gusts, Rain, Snow, Risk badge.
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
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-faint">
          Click row to inspect
        </span>
      </div>

      {/* Scrollable Table Viewport with Sticky Header */}
      <div className="max-h-[340px] overflow-y-auto overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-2 border-b border-border-subtle text-[11px] font-mono uppercase tracking-wider text-text-faint">
            <tr>
              <th className="py-2.5 px-3 whitespace-nowrap">Mile</th>
              <th className="py-2.5 px-3 whitespace-nowrap">ETA</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Wind & Gusts</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Rain</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Snow</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/30 font-mono tabular">
            {route.checkpoints.map((cp) => {
              const key = `${route.id}:${cp.index}`;
              const isSelected = selectedCheckpointKey === key;

              return (
                <tr
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
                  className={`cursor-pointer transition-colors select-none focus:outline-none focus:bg-surface-3 ${
                    isSelected
                      ? 'bg-cobalt/20 hover:bg-cobalt/25 text-white font-medium border-l-2 border-l-cobalt'
                      : 'hover:bg-surface-2/60 text-text-muted'
                  }`}
                >
                  {/* Mile */}
                  <td className="py-2 px-3 text-white font-medium whitespace-nowrap">
                    {formatMilesValue(cp.mile, 1)}
                  </td>

                  {/* ETA */}
                  <td className="py-2 px-3 whitespace-nowrap font-body text-[11px] text-text-primary">
                    {formatUtcInBrowserTimezone(cp.eta_utc, { includeDate: false })}
                  </td>

                  {/* Wind */}
                  <td className="py-2 px-3 whitespace-nowrap text-text-primary">
                    {formatWind(cp.weather?.wind_mph, cp.weather?.wind_gust_mph)}
                  </td>

                  {/* Rain */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    {formatRain(cp.weather?.rain_in_hr)}
                  </td>

                  {/* Snow */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    {formatSnow(cp.weather?.snow_in_hr)}
                  </td>

                  {/* Risk Badge */}
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <RiskBadge level={cp.risk?.level} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
