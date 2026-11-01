'use client';

/**
 * @file ResultsSkeleton.jsx
 * Loading skeleton shimmer component displayed while trip planning is in flight.
 * Features transform gradient shimmer animation, respecting reduced motion.
 *
 * References:
 * ARCHITECTURE.md Section 17.4, 25.5.
 */

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useIsMounted } from '../../hooks/useIsMounted';

export default function ResultsSkeleton() {
  const isMounted = useIsMounted();
  const isReducedMotion = useReducedMotion();
  const effectiveReducedMotion = isMounted && isReducedMotion;

  const shimmerClass = effectiveReducedMotion
    ? 'bg-surface-2'
    : 'relative overflow-hidden bg-surface-2 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent';

  return (
    <div
      role="status"
      aria-label="Calculating routes and risk analysis..."
      aria-busy="true"
      className="space-y-4 mt-6 select-none"
    >
      {/* Recommendation Banner Skeleton */}
      <div className={`h-28 rounded-2xl border border-border-subtle p-4 ${shimmerClass}`}>
        <div className="w-24 h-4 rounded bg-surface-3 mb-3" />
        <div className="w-56 h-7 rounded bg-surface-3 mb-2" />
        <div className="w-4/5 h-3 rounded bg-surface-3" />
      </div>

      {/* 3 Route Cards Skeletons */}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`rounded-2xl border border-border-subtle p-4 space-y-3 ${shimmerClass}`}
          >
            {/* Top row */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-surface-3" />
                <div className="w-20 h-4 rounded bg-surface-3" />
              </div>
              <div className="w-24 h-4 rounded-full bg-surface-3" />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="h-14 rounded-xl bg-surface-3/60" />
              <div className="h-14 rounded-xl bg-surface-3/60" />
              <div className="h-14 rounded-xl bg-surface-3/60" />
            </div>

            {/* Time range */}
            <div className="h-7 rounded-lg bg-surface-3/40" />

            {/* Horizontal breakdown bar */}
            <div className="h-2.5 rounded-full bg-surface-3" />
          </div>
        ))}
      </div>

      {/* Checkpoint Table Skeleton */}
      <div className={`h-48 rounded-2xl border border-border-subtle p-4 ${shimmerClass}`}>
        <div className="w-32 h-4 rounded bg-surface-3 mb-4" />
        <div className="space-y-2">
          <div className="w-full h-6 rounded bg-surface-3/50" />
          <div className="w-full h-6 rounded bg-surface-3/40" />
          <div className="w-full h-6 rounded bg-surface-3/30" />
        </div>
      </div>
    </div>
  );
}
