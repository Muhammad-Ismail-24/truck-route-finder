'use client';

/**
 * @file ScrollHero.jsx
 * Scroll-scrubbed freight landing hero component.
 * Ported to React client component per ARCHITECTURE.md Section 25 and docs/HERO_SPEC.md.
 *
 * Owns DOM element refs and passes them to useHeroScroll.
 * ZERO React state is stored or modified during scroll.
 */

import { useRef } from 'react';
import HeroNav from './HeroNav';
import HeroStrip from './HeroStrip';
import useHeroScroll from '../../hooks/useHeroScroll';
import {
  GIANT_LETTERS,
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

  useHeroScroll({
    trackRef,
    sceneRef,
    videoRef,
    lettersRef,
    stripRef,
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
        <div className="hero-band">
          <HeroStrip stripRef={stripRef} />
        </div>
      </div>
    </div>
  );
}
