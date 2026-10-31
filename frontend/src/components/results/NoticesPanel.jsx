'use client';

/**
 * @file NoticesPanel.jsx
 * Informational notices banner for warnings like long-range forecast accuracy,
 * truncated heatmaps, or fewer than 3 alternative routes.
 *
 * References:
 * ARCHITECTURE.md Section 15.3, 17.4.
 */

/**
 * @param {Object} props
 * @param {Array<{ code: string, message: string }>} [props.notices=[]]
 */
export default function NoticesPanel({ notices = [] }) {
  if (!Array.isArray(notices) || notices.length === 0) return null;

  return (
    <div className="space-y-2" role="region" aria-label="Route advisories">
      {notices.map((notice, i) => (
        <div
          key={notice.code || i}
          className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-2/80 border border-border-subtle text-xs text-text-muted leading-relaxed"
        >
          <svg
            className="w-4 h-4 text-cobalt flex-shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div className="font-body text-xs">
            <span className="font-semibold text-white mr-1.5 uppercase tracking-wide font-mono text-[10px]">
              {notice.code?.replace(/_/g, ' ') || 'NOTICE'}:
            </span>
            <span>{notice.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
