'use client';

/**
 * @file HeroNav.jsx
 * Absolute header at the top of the hero track.
 * Scrolls away naturally as the user scrolls into the scene.
 * Contains brand name and real <a> links to the planner section with smooth/instant scroll.
 */

import { BRAND_NAME, NAV_LINKS } from './heroConfig';

/**
 * Helper to scroll to #planner with reduced-motion awareness.
 * @param {React.MouseEvent<HTMLAnchorElement>} [e]
 */
export function handleScrollToPlanner(e) {
  if (e) e.preventDefault();
  const planner = document.getElementById('planner');
  if (planner) {
    const isReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    planner.scrollIntoView({
      behavior: isReduced ? 'auto' : 'smooth',
      block: 'start',
    });
  }
}

export default function HeroNav() {
  return (
    <header className="hero-nav">
      <div className="hero-nav-brand">{BRAND_NAME}</div>
      <nav className="hero-nav-actions" aria-label="Hero navigation">
        <a
          href={NAV_LINKS.plannerText.href}
          className="hero-nav-link"
          onClick={handleScrollToPlanner}
        >
          {NAV_LINKS.plannerText.label}
        </a>
        <a
          href={NAV_LINKS.plannerButton.href}
          className="hero-nav-btn"
          onClick={handleScrollToPlanner}
        >
          {NAV_LINKS.plannerButton.label}
        </a>
      </nav>
    </header>
  );
}
