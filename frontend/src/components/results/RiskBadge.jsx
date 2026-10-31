'use client';

/**
 * @file RiskBadge.jsx
 * Reusable risk level badge adhering to the theme palette in riskLevels.js.
 * Guarantees WCAG AA contrast on dark surfaces by applying outline to NO_TRAVEL.
 *
 * References:
 * ARCHITECTURE.md Section 17.7.
 */

import { getRiskLevel } from '../../lib/risk/riskLevels';

/**
 * @param {Object} props
 * @param {string} props.level RiskLevel string key (LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL)
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {string} [props.className='']
 */
export default function RiskBadge({ level, size = 'md', className = '' }) {
  const meta = getRiskLevel(level);

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-0.5',
    lg: 'text-sm px-3 py-1',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-body font-semibold uppercase tracking-wider select-none shrink-0 ${sizeClasses[size] || sizeClasses.md} ${className}`}
      style={{
        backgroundColor: meta.fill,
        color: meta.textColor,
        outline: meta.outline || undefined,
      }}
    >
      {meta.label}
    </span>
  );
}
