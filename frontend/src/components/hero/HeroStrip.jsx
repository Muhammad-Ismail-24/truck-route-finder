/**
 * @file HeroStrip.jsx
 * The horizontal strip that slides in from the right across the dark band.
 * Contains the headline lead block and the 5 service/feature cards.
 * Translates via ref-driven transform in useHeroScroll.
 */

import HeroCard from './HeroCard';
import { STRIP_HEADLINE, STRIP_PARAGRAPHS, HERO_CARDS } from './heroConfig';

export default function HeroStrip({ stripRef }) {
  return (
    <div ref={stripRef} className="hero-strip">
      <div className="hero-lead">
        <h1 className="hero-headline">
          <span className="hero-headline-line">{STRIP_HEADLINE.line1}</span>
          <span className="hero-headline-line">{STRIP_HEADLINE.line2}</span>
          <span className="hero-headline-line hero-headline-accent">
            {STRIP_HEADLINE.line3}
          </span>
        </h1>
        <div className="hero-lead-paragraphs">
          <p className="hero-lead-p">{STRIP_PARAGRAPHS.p1}</p>
          <p className="hero-lead-p">{STRIP_PARAGRAPHS.p2}</p>
        </div>
      </div>
      <div className="hero-cards-row">
        {HERO_CARDS.map((card, index) => (
          <HeroCard
            key={card.id || index}
            index={index}
            icon={card.icon}
            title={card.title}
            body={card.body}
          />
        ))}
      </div>
    </div>
  );
}
