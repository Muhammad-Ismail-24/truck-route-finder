'use client';

/**
 * @file PlannerSection.jsx
 * Shell for the main planner interface.
 *
 * Features:
 * - id="planner" with scroll-margin-top: 0
 * - Ink (#111) background continuing seamlessly from the hero's black band.
 * - Eyebrow "THE PLANNER" and large Anton heading "PLAN YOUR ROUTE"
 *   with masked word slide-up and animated cobalt rule.
 * - Responsive two-column desktop / stacked mobile layout:
 *   - Desktop: ~440px --surface-1 sidebar panel (radius 24) on the left,
 *     rounded 24px map frame on the right.
 *   - Mobile: map first (~45vh), sidebar below.
 * - MapView dynamically imported with ssr: false.
 * - Both panels wrapped in Reveal with 80ms stagger.
 * - Empty state with three numbered steps using mono numerals.
 * - Temporarily displays result JSON in a collapsed debug <details> (removed in T-22).
 *
 * References:
 * ARCHITECTURE.md Section 17.1, 17.5, 25.1, 25.4, 25.5, Decisions D-17, D-27, D-28, D-31.
 */

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Reveal from '../motion/Reveal';
import TripForm from '../trip-form/TripForm';
import ResultsPanel from '../results/ResultsPanel';
import ResultsSkeleton from '../results/ResultsSkeleton';
import ErrorPanel from '../results/ErrorPanel';
import { useTripCore } from '../../state/TripProvider';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useIsMounted } from '../../hooks/useIsMounted';
import { getRecommendedRoute } from '../../state/selectors';

const MapView = dynamic(() => import('../map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full flex-1 min-h-[350px] lg:min-h-0 flex flex-col items-center justify-center bg-surface-1 text-text-muted gap-3 p-6 select-none">
      <div className="w-8 h-8 rounded-full border-2 border-cobalt border-t-transparent animate-spin" />
      <span className="font-body text-xs uppercase tracking-wider text-text-faint">
        Loading Map Engine…
      </span>
    </div>
  ),
});

export default function PlannerSection() {
  const { state } = useTripCore();
  const isMounted = useIsMounted();
  const isReducedMotion = useReducedMotion();
  const [headerVisible, setHeaderVisible] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const headerRef = useRef(null);
  const mapContainerRef = useRef(null);

  useEffect(() => {
    if (!isMounted || isReducedMotion) return;

    const headerEl = headerRef.current;
    let headerObs;
    if (headerEl) {
      headerObs = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting) {
            setHeaderVisible(true);
            headerObs.disconnect();
          }
        },
        { threshold: 0.2 }
      );
      headerObs.observe(headerEl);
    }

    const mapEl = mapContainerRef.current;
    let mapObs;
    if (mapEl) {
      mapObs = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting) {
            setMapVisible(true);
            mapObs.disconnect();
          }
        },
        { rootMargin: '300px' }
      );
      mapObs.observe(mapEl);
    }

    return () => {
      if (headerObs) headerObs.disconnect();
      if (mapObs) mapObs.disconnect();
    };
  }, [isMounted, isReducedMotion]);

  const words = ['PLAN', 'YOUR', 'ROUTE'];
  const isShown = (isMounted && isReducedMotion) || headerVisible;
  const isMapShown = (isMounted && isReducedMotion) || mapVisible;
  const recommendedRoute = state.result ? getRecommendedRoute(state) : null;

  return (
    <section
      id="planner"
      className="min-h-screen bg-ink text-white px-4 sm:px-6 lg:px-12 py-12 lg:py-16 scroll-mt-0 relative"
      style={{ scrollMarginTop: 0 }}
    >
      {/* Accessible Live Region for Screen Reader Announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {state.status === 'loading' && 'Planning route and calculating weather risk across corridor…'}
        {state.status === 'success' && state.result &&
          `Route plan ready. Evaluated ${state.result.routes?.length || 3} options. Recommended route is ${recommendedRoute?.label || 'Route A'}.`}
        {state.status === 'error' && state.error &&
          `Route planning failed: ${state.error.message || 'Error occurred.'}`}
      </div>

      <div className="max-w-[1600px] mx-auto flex flex-col h-full">
        {/* Animated Heading Section */}
        <div ref={headerRef} className="mb-8 lg:mb-10">
          <p className="font-body text-xs sm:text-sm uppercase tracking-[0.2em] text-text-muted mb-2 select-none">
            THE PLANNER
          </p>

          <div className="inline-block relative pb-3">
            <h2 className="font-display text-4xl sm:text-6xl lg:text-7xl uppercase tracking-wide leading-none text-white flex gap-x-3 sm:gap-x-4 flex-wrap">
              {words.map((word, i) => (
                <span
                  key={word}
                  className="inline-block overflow-hidden py-1"
                >
                  <span
                    className="inline-block transition-transform"
                    style={{
                      transform: isShown
                        ? 'translateY(0)'
                        : 'translateY(110%)',
                      transitionDuration: isReducedMotion
                        ? '0ms'
                        : 'var(--motion-slow, 600ms)',
                      transitionTimingFunction:
                        'var(--motion-ease, cubic-bezier(0.22, 1, 0.36, 1))',
                      transitionDelay: isReducedMotion ? '0ms' : `${i * 60}ms`,
                    }}
                  >
                    {word}
                  </span>
                </span>
              ))}
            </h2>

            {/* Cobalt Accent Rule */}
            <div
              className="absolute bottom-0 left-0 h-[2px] bg-cobalt w-full origin-left transition-transform"
              style={{
                transform: isShown ? 'scaleX(1)' : 'scaleX(0)',
                transitionDuration: isReducedMotion
                  ? '0ms'
                  : 'var(--motion-slow, 600ms)',
                transitionTimingFunction:
                  'var(--motion-ease, cubic-bezier(0.22, 1, 0.36, 1))',
                transitionDelay: isReducedMotion ? '0ms' : '200ms',
              }}
            />
          </div>
        </div>

        {/* Layout Grid: Desktop 2-column, Mobile stacked (Map first) */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 flex-1 lg:items-start">
          {/* Left Column: Sidebar Panel (Desktop ~440px, Mobile order-2) */}
          <Reveal
            delay={0}
            className="w-full lg:w-[440px] flex-shrink-0 order-2 lg:order-1 flex flex-col"
          >
            <div className="bg-surface-1 border border-border-subtle rounded-[24px] p-6 lg:p-7 flex flex-col flex-1">
              {/* Sidebar Header */}
              <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-6">
                <div>
                  <h3 className="font-display text-lg uppercase tracking-wider text-white">
                    TRIP PARAMETERS
                  </h3>
                  <p className="font-body text-xs text-text-muted mt-0.5">
                    Configure route & vehicle load
                  </p>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-cobalt" />
              </div>

              {/* Trip Input Form */}
              <TripForm />

              {/* Loading State: Results Skeleton with Shimmer */}
              {state.status === 'loading' && <ResultsSkeleton />}

              {/* Error State: Error Panel with Mapped Error Codes */}
              {state.status === 'error' && state.error && (
                <ErrorPanel error={state.error} />
              )}

              {/* Success State: Results Panel (Recommendation, RouteCards, CheckpointTable) */}
              {state.status === 'success' && state.result && <ResultsPanel />}

              {/* Empty State Instruction Block (shown before first plan or when idle) */}
              {state.status === 'idle' && !state.result && (
                <div className="bg-surface-2 border border-border-subtle rounded-2xl p-5 space-y-4 mt-6">
                  <div className="flex items-center gap-2 text-text-muted">
                    <svg
                      className="w-4 h-4 text-cobalt flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span className="font-body text-xs uppercase tracking-wider font-semibold text-white">
                      HOW IT WORKS
                    </span>
                  </div>

                  <ol className="space-y-3.5">
                    <li className="flex items-start gap-3">
                      <span className="font-mono text-sm font-semibold text-cobalt tabular bg-surface-3 px-2 py-0.5 rounded border border-border-subtle">
                        01
                      </span>
                      <div className="font-body text-xs text-text-muted leading-relaxed">
                        <strong className="text-white block font-medium">Enter Route Endpoints</strong>
                        Select origin and destination locations via autocomplete suggestions.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="font-mono text-sm font-semibold text-cobalt tabular bg-surface-3 px-2 py-0.5 rounded border border-border-subtle">
                        02
                      </span>
                      <div className="font-body text-xs text-text-muted leading-relaxed">
                        <strong className="text-white block font-medium">Specify Load & Schedule</strong>
                        Enter departure date/time and cargo weight (1–80,000 lb) for custom wind risk limits.
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="font-mono text-sm font-semibold text-cobalt tabular bg-surface-3 px-2 py-0.5 rounded border border-border-subtle">
                        03
                      </span>
                      <div className="font-body text-xs text-text-muted leading-relaxed">
                        <strong className="text-white block font-medium">Analyze Safest Route</strong>
                        Compare 3 truck routes scored mile-by-mile, inspect checkpoints, and scrub the 48h heatmap.
                      </div>
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </Reveal>

          {/* Right Column: Rounded Map Frame (Desktop sticky frame, Mobile order-1 ~45svh) */}
          <Reveal
            delay={80}
            className="w-full flex-1 order-1 lg:order-2 h-[45svh] min-h-[350px] lg:h-[calc(100svh-32px)] lg:min-h-[480px] lg:sticky lg:top-4 lg:self-start flex flex-col"
          >
            <div
              ref={mapContainerRef}
              className="bg-surface-1 border border-border-subtle rounded-[24px] w-full flex-1 min-h-[350px] lg:min-h-0 relative overflow-hidden shadow-2xl flex flex-col"
            >
              {isMapShown ? (
                <MapView />
              ) : (
                <div className="w-full flex-1 min-h-[350px] lg:min-h-0 flex flex-col items-center justify-center bg-surface-1 text-text-muted gap-3 p-6 select-none">
                  <div className="w-8 h-8 rounded-full border-2 border-cobalt border-t-transparent animate-spin" />
                  <span className="font-body text-xs uppercase tracking-wider text-text-faint">
                    Loading Map Engine…
                  </span>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
