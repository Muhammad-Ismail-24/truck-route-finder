'use client';

/**
 * @file RecommendationBanner.jsx
 * Displays the primary recommendation banner with route name, decision reasons,
 * and warning styling if the best route encounters Severe or No Travel risks.
 * A cobalt underline sweeps once under the recommended route name.
 *
 * References:
 * ARCHITECTURE.md Section 17.4, 25.5, Decisions D-08, D-19.
 */

import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @param {Object} props
 * @param {import('../../lib/types').Recommendation} props.recommendation
 * @param {import('../../lib/types').Route} [props.recommendedRoute]
 */
export default function RecommendationBanner({ recommendation, recommendedRoute }) {
  const isReducedMotion = useReducedMotion();

  if (!recommendation) return null;

  const status = recommendation.status || 'OK';
  const reasons = recommendation.reasons || [];
  const routeName = recommendedRoute?.label || recommendation.route_id || 'Recommended Route';

  // Determine warning level if status is OK_WITH_WARNING
  const isWarning = status === 'OK_WITH_WARNING';
  const hasNoTravel = (recommendedRoute?.summary?.miles_by_level?.NO_TRAVEL || 0) > 0;
  const isRedWarning = isWarning && hasNoTravel;
  const isOrangeWarning = isWarning && !hasNoTravel;

  // Visual container styling based on warning status
  let containerStyle = 'bg-surface-2 border-border-strong';
  let badgeStyle = 'bg-cobalt/20 border-cobalt/40 text-cobalt';
  let badgeText = 'SAFEST CHOICE';

  if (isRedWarning) {
    containerStyle = 'bg-[#6B1D1D]/25 border-[#EB5757]/60';
    badgeStyle = 'bg-[#EB5757]/20 border-[#EB5757]/50 text-[#EB5757]';
    badgeText = 'WARNING: NO TRAVEL CONDITIONS';
  } else if (isOrangeWarning) {
    containerStyle = 'bg-[#F2994A]/15 border-[#F2994A]/50';
    badgeStyle = 'bg-[#F2994A]/20 border-[#F2994A]/50 text-[#F2994A]';
    badgeText = 'ADVISORY: SEVERE WEATHER';
  }

  return (
    <div
      role="region"
      aria-label="Route recommendation"
      className={`rounded-2xl p-4 sm:p-5 border shadow-xl relative overflow-hidden ${containerStyle}`}
    >
      {/* Top Tag & Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono tabular font-semibold uppercase tracking-wider border ${badgeStyle}`}
        >
          {badgeText}
        </span>

        {isWarning && (
          <span className="text-[11px] font-mono text-text-faint uppercase tracking-wider">
            Least Bad Option (D-08)
          </span>
        )}
      </div>

      {/* Recommended Route Title with Sweeping Cobalt Underline */}
      <div className="relative inline-block mb-3">
        <h2 className="font-display text-2xl sm:text-3xl text-white tracking-wide uppercase">
          {`RECOMMENDED: ${routeName}`}
        </h2>

        {/* Cobalt sweep underline */}
        <span
          className="absolute left-0 bottom-[-2px] h-[3px] bg-cobalt rounded-full origin-left"
          style={{
            width: '100%',
            animation: isReducedMotion
              ? 'none'
              : 'underline-sweep 600ms cubic-bezier(0.22, 1, 0.36, 1) 200ms forwards',
            transform: isReducedMotion ? 'scaleX(1)' : 'scaleX(0)',
          }}
          aria-hidden="true"
        />
      </div>

      {/* Reasons List */}
      {reasons.length > 0 && (
        <ul className="space-y-1.5 mt-2">
          {reasons.map((reason, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs sm:text-sm text-text-muted leading-relaxed font-body"
            >
              <span className="text-cobalt font-bold select-none">•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
