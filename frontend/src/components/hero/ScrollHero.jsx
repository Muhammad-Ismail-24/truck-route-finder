'use client';

/**
 * @file ScrollHero.jsx
 * Scroll-scrubbed freight landing hero component.
 * Ported to React client component per ARCHITECTURE.md Section 25 and docs/HERO_SPEC.md.
 *
 * Finished features (T-17):
 * - Nav links and bottom pill with smooth scroll (instant on reduced motion).
 * - Speed readout (NN MPH) top-left in mono, revealed on settle (--ph = 1).
 * - Bottom pill "Plan a route" fades and rises 24px at settle.
 * - Card reveal gradient & icons.
 * - Zero React state modified on scroll.
 */

import { useRef } from 'react';
import HeroNav, { handleScrollToPlanner } from './HeroNav';
import HeroStrip from './HeroStrip';
import useHeroScroll from '../../hooks/useHeroScroll';
import {
  GIANT_LETTERS,
  BOTTOM_PILL_TEXT,
  POSTER_URL,
  VIDEO_1080P_URL,
} from './heroConfig';
import './hero.css';

export default function ScrollHero() {
  const trackRef = useRef(null);
  const sceneRef = useRef(null);
  const videoRef = useRef(null);
  const lettersRef = useRef(null);
  const stripRef = useRef(null);
  const readoutRef = useRef(null);

  useHeroScroll({
    trackRef,
    sceneRef,
    videoRef,
    lettersRef,
    stripRef,
    readoutRef,
  });

  return (
    <div ref={trackRef} className="hero-track">
      <HeroNav />
      <div ref={sceneRef} className="hero-scene">
        <video
          ref={videoRef}
          src={VIDEO_1080P_URL}
          poster={POSTER_URL}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          tabIndex={-1}
          className="hero-video"
        />

        <div ref={lettersRef} className="hero-giant-letters" aria-hidden="true">
          {GIANT_LETTERS}
        </div>

        <div ref={readoutRef} className="hero-readout tabular" aria-hidden="true">
          00 MPH
        </div>

        <div className="hero-band">
          <HeroStrip stripRef={stripRef} />
          <a
            href="#planner"
            className="hero-bottom-pill"
            onClick={handleScrollToPlanner}
          >
            {BOTTOM_PILL_TEXT}
          </a>
        </div>
      </div>
    </div>
  );
}
