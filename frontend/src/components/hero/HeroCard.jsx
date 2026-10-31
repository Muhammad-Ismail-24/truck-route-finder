/**
 * @file HeroCard.jsx
 * Single card in the hero horizontal strip.
 * Features a 38u white line icon, two-line Anton title, and Archivo body.
 * Card reveal gradient is controlled via --hero-card-s CSS variable from the rAF loop.
 * Card text stays real selectable text per Section 25.3.
 */

import { HeroIcon } from './HeroIcons';

export default function HeroCard({ title, body, icon, index }) {
  const titleLines = Array.isArray(title) ? title : title.split('\n');

  return (
    <article className="hero-card" data-index={index}>
      <div className="hero-card-icon-wrap" aria-hidden="true">
        <HeroIcon name={icon} />
      </div>
      <h3 className="hero-card-title">
        {titleLines.map((line, i) => (
          <span key={i} className="hero-card-title-line">
            {line}
          </span>
        ))}
      </h3>
      <p className="hero-card-body">{body}</p>
    </article>
  );
}
