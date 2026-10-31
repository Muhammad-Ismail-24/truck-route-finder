'use client';

/**
 * @file CheckpointPopup.jsx
 * Themed popup card displayed when a checkpoint is selected on the map.
 *
 * Requirements (Section 17.5 & 25.5):
 * - Themed in dark surfaces (--surface-1, radius 16-24px, subtle border).
 * - Mile in mono tabular numerals.
 * - ETA in the browser's local timezone with offset label.
 * - Weather conditions: wind with gusts, rain, snow in mono tabular numerals.
 * - Risk badge using riskLevels fill, textColor, and outline.
 * - Weather driver indication.
 * - Plain-language note when a load rule applied (WIND_45_54_OVER_30K or WIND_35_44_OVER_40K).
 * - Close button with accessible labeling and focus ring.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, 17.7, 25.5.
 */

import { getRiskLevel } from '../../lib/risk/riskLevels';
import { formatUtcInBrowserTimezone } from '../../lib/format/time';
import { formatMilesValue } from '../../lib/format/distance';
import { formatWind, formatRain, formatSnow } from '../../lib/format/weather';

/**
 * @param {Object} props
 * @param {import('../../lib/types').Checkpoint} props.checkpoint
 * @param {import('../../lib/types').Route} [props.route]
 * @param {() => void} props.onClose
 */
export default function CheckpointPopup({ checkpoint, route, onClose }) {
  if (!checkpoint) return null;

  const { weather, risk } = checkpoint;
  const riskMeta = getRiskLevel(risk?.level);
  const loadRule = risk?.load_rule;

  // Format driver string (e.g. "WIND" -> "Wind")
  const driverFormatted = risk?.driver
    ? risk.driver.charAt(0) + risk.driver.slice(1).toLowerCase()
    : 'None';

  return (
    <div
      role="dialog"
      aria-label={`Checkpoint mile ${checkpoint.mile} details`}
      className="bg-surface-1 border border-border-subtle rounded-[20px] shadow-2xl p-4 w-[310px] text-white font-body select-none transition-all"
    >
      {/* Top Header: Route/Mile Eyebrow + Close Button */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle/60">
        <div className="flex items-center gap-2">
          {route?.label && (
            <span className="px-2 py-0.5 rounded-full bg-surface-2 border border-border-subtle text-[11px] font-mono tabular font-medium text-text-muted">
              {route.label}
            </span>
          )}
          <span className="font-mono tabular text-sm font-semibold text-white">
            {`Mile ${formatMilesValue(checkpoint.mile, 1)}`}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close checkpoint details"
          className="p-1 rounded-full text-text-muted hover:text-white hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-cobalt transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Risk Badge and Primary Driver */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase font-body"
            style={{
              backgroundColor: riskMeta.fill,
              color: riskMeta.textColor,
              outline: riskMeta.outline || undefined,
            }}
          >
            {riskMeta.label}
          </span>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-text-faint uppercase tracking-wider block">
            Primary Driver
          </span>
          <span className="text-xs font-medium text-text-primary">
            {driverFormatted}
          </span>
        </div>
      </div>

      {/* ETA Display in Browser Timezone */}
      <div className="mt-3 p-2.5 rounded-xl bg-surface-2/80 border border-border-subtle/50">
        <div className="text-[10px] uppercase font-mono tracking-wider text-text-faint mb-0.5">
          Estimated Arrival (ETA)
        </div>
        <div className="font-mono tabular text-xs text-text-primary">
          {formatUtcInBrowserTimezone(checkpoint.eta_utc)}
        </div>
      </div>

      {/* Weather Metrics Grid (All mono tabular figures) */}
      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        {/* Wind Condition */}
        <div className="p-2 rounded-xl bg-surface-2/50 border border-border-subtle/40 col-span-2">
          <div className="text-[10px] uppercase font-mono tracking-wider text-text-faint mb-0.5 flex items-center justify-between">
            <span>Sustained Wind & Gusts</span>
            <span className="text-[10px] text-text-muted lowercase">
              {risk?.wind_level ? `${risk.wind_level}` : ''}
            </span>
          </div>
          <div className="font-mono tabular text-xs font-medium text-white">
            {formatWind(weather?.wind_mph, weather?.wind_gust_mph)}
          </div>
        </div>

        {/* Rain Rate */}
        <div className="p-2 rounded-xl bg-surface-2/50 border border-border-subtle/40">
          <div className="text-[10px] uppercase font-mono tracking-wider text-text-faint mb-0.5">
            Rainfall
          </div>
          <div className="font-mono tabular text-xs font-medium text-white">
            {formatRain(weather?.rain_in_hr)}
          </div>
        </div>

        {/* Snow Rate */}
        <div className="p-2 rounded-xl bg-surface-2/50 border border-border-subtle/40">
          <div className="text-[10px] uppercase font-mono tracking-wider text-text-faint mb-0.5">
            Snowfall
          </div>
          <div className="font-mono tabular text-xs font-medium text-white">
            {formatSnow(weather?.snow_in_hr)}
          </div>
        </div>
      </div>

      {/* Plain-Language Load Rule Note (when triggered) */}
      {loadRule === 'WIND_45_54_OVER_30K' && (
        <div className="mt-3 p-2.5 rounded-xl bg-[#6B1D1D]/30 border border-[#EB5757]/40 text-xs text-text-primary leading-relaxed">
          <div className="font-semibold text-[#EB5757] flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wide">
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Load Rule Escalation</span>
          </div>
          <p className="text-text-muted text-[11px]">
            Wind 45–54 mph with load &gt; 30,000 lb escalates risk to{' '}
            <strong className="text-white font-semibold">NO TRAVEL</strong> due to high rollover hazard.
          </p>
        </div>
      )}

      {loadRule === 'WIND_35_44_OVER_40K' && (
        <div className="mt-3 p-2.5 rounded-xl bg-[#EB5757]/15 border border-[#F2994A]/40 text-xs text-text-primary leading-relaxed">
          <div className="font-semibold text-[#F2994A] flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wide">
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Load Rule Escalation</span>
          </div>
          <p className="text-text-muted text-[11px]">
            Wind 35–44 mph with load &gt; 40,000 lb escalates risk to at least{' '}
            <strong className="text-white font-semibold">SEVERE</strong> due to heavy crosswind sensitivity.
          </p>
        </div>
      )}
    </div>
  );
}
