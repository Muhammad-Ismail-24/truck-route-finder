/**
 * @file HeroNav.jsx
 * Absolute header at the top of the hero track.
 * Scrolls away naturally as the user scrolls into the scene.
 * Contains brand name and links to the planner section.
 */

import { BRAND_NAME, NAV_LINKS } from './heroConfig';

export default function HeroNav() {
  return (
    <header className="hero-nav">
      <div className="hero-nav-brand">{BRAND_NAME}</div>
      <nav className="hero-nav-actions" aria-label="Hero navigation">
        <a href={NAV_LINKS.plannerText.href} className="hero-nav-link">
          {NAV_LINKS.plannerText.label}
        </a>
        <a href={NAV_LINKS.plannerButton.href} className="hero-nav-btn">
          {NAV_LINKS.plannerButton.label}
        </a>
      </nav>
    </header>
  );
}
