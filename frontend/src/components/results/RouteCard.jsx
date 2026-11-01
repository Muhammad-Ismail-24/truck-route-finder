'use client';

/**
 * @file RouteCard.jsx
 * Interactive route selection card displaying route summary, risk statistics,
 * and stacked risk breakdown bar.
 *
 * Selection = cobalt border + 2px lift with a --motion-fast transition.
 * Cards stagger in with translateY(16px -> 0) + fade.
 *
 * References:
 * ARCHITECTURE.md Section 17.4, 25.5.
 */

import { getRouteColor } from '../../lib/risk/riskLevels';
import RouteSummaryStats from './RouteSummaryStats';
import RiskBreakdownBar from './RiskBreakdownBar';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useIsMounted } from '../../hooks/useIsMounted';

/**
 * @param {Object} props
 * @param {import('../../lib/types').Route} props.route
 * @param {boolean} props.isSelected
 * @param {() => void} props.onClick
 * @param {number} [props.index=0] Stagger index
 */
export default function RouteCard({ route, isSelected, onClick, index = 0 }) {
  const isMounted = useIsMounted();
  const isReducedMotion = useReducedMotion();
  const effectiveReducedMotion = isMounted && isReducedMotion;
  const routeColor = getRouteColor(route.id || route.label);
  const isRecommended = Boolean(route.is_recommended);

  // Stagger entrance animation delay: 50ms per card
  const staggerDelayMs = (index + 1) * 50;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-pressed={isSelected}
      aria-label={`${route.label || route.id}: ${isRecommended ? 'Recommended route, ' : ''}${route.summary?.distance_miles || 0} miles`}
      className={`group relative text-left rounded-2xl p-4 transition-all duration-150 cursor-pointer select-none border focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-2 focus:ring-offset-ink ${
        isSelected
          ? 'bg-surface-2 border-cobalt shadow-lg shadow-cobalt/10 -translate-y-[2px]'
          : 'bg-surface-1 border-border-subtle hover:border-border-strong hover:-translate-y-[1px]'
      }`}
      style={{
        animation: effectiveReducedMotion
          ? 'none'
          : `route-card-stagger 400ms cubic-bezier(0.22, 1, 0.36, 1) ${staggerDelayMs}ms backwards`,
      }}
    >
      {/* Top Header: Route Color Swatch + Label + Recommended Pill */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          {/* Colored Route Swatch */}
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white/10"
            style={{ backgroundColor: routeColor }}
            aria-hidden="true"
          />
          <h4 className="font-display text-base tracking-wide uppercase text-white">
            {route.label || route.id}
          </h4>
        </div>

        {isRecommended && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cobalt/20 border border-cobalt/40 text-cobalt text-[11px] font-mono tabular font-semibold uppercase tracking-wider">
            ★ Recommended
          </span>
        )}
      </div>

      {/* Numerical Metrics Summary Grid */}
      <RouteSummaryStats summary={route.summary} />

      {/* Stacked Risk Breakdown Horizontal Bar */}
      <div className="mt-4 pt-3 border-t border-border-subtle/40">
        <RiskBreakdownBar
          milesByLevel={route.summary?.miles_by_level}
          totalMiles={route.summary?.distance_miles}
        />
      </div>
    </div>
  );
}
