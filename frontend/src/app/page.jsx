'use client';

/**
 * @file page.jsx
 * Main entry landing page composed of:
 * 1. ScrollHero: scroll-scrubbed freight storytelling scene ending in a #111 ground band.
 * 2. PlannerSection: main route planning interface with sidebar and map viewport.
 * 3. Footer: required upstream data attribution.
 *
 * Wrapped by TripProvider here at the page root to ensure:
 * - Trip planning state is cleanly scoped to the planner page.
 * - Global layout (fonts, metadata, global styles) remains lightweight in layout.jsx.
 * - All planner components, forms, and results share reactive dispatch/selector state.
 */

import { TripProvider } from '../state/TripProvider';
import ScrollHero from '../components/hero/ScrollHero';
import PlannerSection from '../components/layout/PlannerSection';
import Footer from '../components/layout/Footer';

export default function Page() {
  return (
    <TripProvider>
      <div className="min-h-screen bg-ink text-white selection:bg-cobalt selection:text-white relative">
        {/* Skip to Main Planner Content Link for Screen Readers & Keyboard Nav */}
        <a
          href="#planner"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-5 focus:py-3 focus:bg-cobalt focus:text-white focus:rounded-full focus:font-body focus:text-sm focus:font-semibold focus:shadow-2xl focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-ink min-h-[44px] flex items-center justify-center transition-all"
        >
          Skip to planner
        </a>

        <ScrollHero />
        <PlannerSection />
        <Footer />
      </div>
    </TripProvider>
  );
}
