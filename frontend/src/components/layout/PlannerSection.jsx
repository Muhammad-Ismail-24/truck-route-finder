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
 * - Both panels wrapped in Reveal with 80ms stagger.
 * - Empty state with three numbered steps using mono numerals.
 * - Temporarily displays result JSON in a collapsed debug <details> (removed in T-22).
 *
 * References:
 * ARCHITECTURE.md Section 17.1, 25.1, 25.4, 25.5, Decisions D-27, D-28.
 */

import { useState, useEffect, useRef } from 'react';
import Reveal from '../motion/Reveal';
import TripForm from '../trip-form/TripForm';
import { useTrip } from '../../state/TripProvider';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export default function PlannerSection() {
  const { state } = useTrip();
  const isReducedMotion = useReducedMotion();
  const [headerVisible, setHeaderVisible] = useState(false);
  const headerRef = useRef(null);

  useEffect(() => {
    if (isReducedMotion) return;

    const el = headerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setHeaderVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.2,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [isReducedMotion]);

  const words = ['PLAN', 'YOUR', 'ROUTE'];
  const isShown = isReducedMotion || headerVisible;

  return (
    <section
      id="planner"
      className="min-h-screen bg-ink text-white px-4 sm:px-6 lg:px-12 py-12 lg:py-16 scroll-mt-0 relative"
      style={{ scrollMarginTop: 0 }}
    >
      <div className="max-w-[1600px] mx-auto flex flex-col h-full">
        {/* Animated Heading Section */}
        <div ref={headerRef} className="mb-8 lg:mb-10">
          <p className="font-body text-xs sm:text-sm uppercase tracking-[0.2em] text-text-muted mb-2 select-none">
            THE PLANNER
          </p>

          <div className="inline-block relative pb-3">
            <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl uppercase tracking-wide leading-none text-white flex gap-x-3 sm:gap-x-4 flex-wrap">
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
            </h1>

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
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 flex-1 lg:min-h-[720px]">
          {/* Left Column: Sidebar Panel (Desktop ~440px, Mobile order-2) */}
          <Reveal
            delay={0}
            className="w-full lg:w-[440px] flex-shrink-0 order-2 lg:order-1 flex flex-col"
          >
            <div className="bg-surface-1 border border-border-subtle rounded-[24px] p-6 lg:p-7 flex flex-col flex-1 overflow-y-auto max-h-full">
              {/* Sidebar Header */}
              <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-6">
                <div>
                  <h2 className="font-display text-lg uppercase tracking-wider text-white">
                    TRIP PARAMETERS
                  </h2>
                  <p className="font-body text-xs text-text-muted mt-0.5">
                    Configure route & vehicle load
                  </p>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-cobalt" />
              </div>

              {/* Trip Input Form */}
              <TripForm />

              {/* Temporary Debug Result Output (Section 17.3, T-19 requirement, removed in T-22) */}
              {state.result && (
                <details className="mt-6 p-4 rounded-xl bg-surface-2 border border-border-strong text-xs font-mono">
                  <summary className="cursor-pointer text-cobalt font-semibold select-none flex items-center justify-between">
                    <span>Debug Result JSON</span>
                    <span className="text-[11px] text-text-muted">
                      {state.result.routes?.length || 0} routes calculated
                    </span>
                  </summary>
                  <pre className="mt-3 p-3 bg-ink rounded-lg overflow-x-auto text-[11px] text-emerald-400 max-h-64">
                    {JSON.stringify(state.result, null, 2)}
                  </pre>
                </details>
              )}

              {/* Empty State Instruction Block (shown when no result yet) */}
              {!state.result && (
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
                        Select US origin and destination locations via autocomplete suggestions.
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

          {/* Right Column: Map Frame Placeholder (Desktop flex-1, Mobile order-1 ~45vh) */}
          <Reveal
            delay={80}
            className="w-full flex-1 order-1 lg:order-2 h-[45vh] lg:h-auto min-h-[400px] flex flex-col"
          >
            <div className="bg-surface-1 border border-border-subtle rounded-[24px] w-full h-full relative overflow-hidden flex flex-col items-center justify-center p-6 text-center group">
              {/* Decorative Subtle Grid Backdrop */}
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.2) 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              />

              {/* Map Placeholder Content */}
              <div className="relative z-10 max-w-sm space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-2 border border-border-strong flex items-center justify-center text-cobalt">
                  <svg
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                    <line x1="9" y1="3" x2="9" y2="18" />
                    <line x1="15" y1="6" x2="15" y2="21" />
                  </svg>
                </div>

                <div>
                  <h3 className="font-display text-lg uppercase tracking-wider text-white">
                    MAP VIEWPORT
                  </h3>
                  <p className="font-body text-xs text-text-muted mt-1 leading-relaxed">
                    WebGL map engine (MapLibre GL JS + OpenFreeMap vector tiles) with GPU heatmap overlay.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-2 border border-border-subtle text-[11px] font-mono tabular text-text-faint">
                  <span>OpenFreeMap Positron</span>
                  <span>•</span>
                  <span>Light Style</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
