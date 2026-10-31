/**
 * @file accessibility.test.jsx
 * Tests for responsive layout requirements and accessibility standards (T-25).
 * - Headings hierarchy: single h1 in hero, h2 for planner, h3/h4 below.
 * - Skip link to #planner.
 * - Form input labels and accessible attributes.
 * - aria-live polite region for status announcements.
 * - Keyboard navigation attributes (tabIndex, role, onKeyDown, aria-checked/pressed).
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import Page from '../app/page';
import HeroStrip from './hero/HeroStrip';
import PlannerSection from './layout/PlannerSection';
import TripForm from './trip-form/TripForm';
import IntervalSelect from './trip-form/IntervalSelect';
import CheckpointTable from './results/CheckpointTable';
import Slider from './ui/Slider';
import { TripProvider } from '../state/TripProvider';

describe('T-25 Accessibility & Responsive Standards', () => {
  it('renders skip link targeting #planner at the top of the page', () => {
    const html = renderToString(<Page />);
    expect(html).toContain('href="#planner"');
    expect(html).toContain('Skip to planner');
    expect(html).toContain('sr-only');
    expect(html).toContain('focus:not-sr-only');
  });

  it('enforces single h1 in the Hero and h2 in the Planner heading', () => {
    const heroHtml = renderToString(<HeroStrip stripRef={{ current: null }} />);
    // Hero has h1
    expect(heroHtml).toContain('<h1 class="hero-headline"');

    const plannerHtml = renderToString(
      <TripProvider>
        <PlannerSection />
      </TripProvider>
    );
    // Planner section heading is h2
    expect(plannerHtml).toContain('<h2 class="font-display');
    expect(plannerHtml).toContain('PLAN');
    expect(plannerHtml).toContain('YOUR');
    expect(plannerHtml).toContain('ROUTE');
    // Does not have duplicate h1 in Planner
    expect(plannerHtml).not.toContain('<h1');
  });

  it('renders an accessible aria-live region in PlannerSection', () => {
    const html = renderToString(
      <TripProvider>
        <PlannerSection />
      </TripProvider>
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('role="status"');
  });

  it('provides explicit labels and accessible roles on every form input', () => {
    const html = renderToString(
      <TripProvider>
        <TripForm />
      </TripProvider>
    );
    // Check Origin input and label
    expect(html).toContain('for="origin-input"');
    expect(html).toContain('id="origin-input"');

    // Check Destination input and label
    expect(html).toContain('for="destination-input"');
    expect(html).toContain('id="destination-input"');

    // Check Departure input and label
    expect(html).toContain('for="departure-input"');
    expect(html).toContain('id="departure-input"');

    // Check Load weight input and label
    expect(html).toContain('for="load-weight-input"');
    expect(html).toContain('id="load-weight-input"');

    // Check Interval radiogroup
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('id="interval-select-label"');
    expect(html).toContain('aria-labelledby="interval-select-label"');
  });

  it('renders IntervalSelect with 44px min-height touch targets and radio roles', () => {
    const html = renderToString(<IntervalSelect value={25} onChange={() => {}} />);
    expect(html).toContain('role="radio"');
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
  });

  it('renders Slider with full aria slider roles and 44px hit target thumb', () => {
    const html = renderToString(
      <Slider
        value={12}
        min={0}
        max={48}
        step={1}
        onChange={() => {}}
        ariaLabel="Forecast Hour"
        ariaValueText="+12 hours"
      />
    );
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="48"');
    expect(html).toContain('aria-valuenow="12"');
    expect(html).toContain('aria-valuetext="+12 hours"');
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('before:absolute');
  });

  it('renders CheckpointTable with interactive rows and accessible focus rings', () => {
    const mockRoute = {
      id: 'route-1',
      label: 'Route A',
      checkpoints: [
        {
          index: 0,
          mile: 0,
          lat: 41.8781,
          lng: -87.6298,
          eta_utc: '2026-11-01T12:00:00Z',
          weather: { wind_mph: 15, wind_gust_mph: 22, rain_in_hr: 0, snow_in_hr: 0 },
          risk: { level: 'LOW', driver: 'WIND', load_rule: null },
        },
      ],
    };

    const html = renderToString(
      <CheckpointTable
        route={mockRoute}
        selectedCheckpointKey={null}
        onSelectCheckpoint={() => {}}
      />
    );
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('focus-visible:ring-cobalt');
  });
});
