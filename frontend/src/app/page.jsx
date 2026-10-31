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
      <div className="min-h-screen bg-ink text-white selection:bg-cobalt selection:text-white">
        <ScrollHero />
        <PlannerSection />
        <Footer />
      </div>
    </TripProvider>
  );
}
