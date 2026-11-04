'use client';

/**
 * @file useHeroScroll.js
 * Core custom hook for the landing scroll hero.
 *
 * Responsibilities:
 * - Single requestAnimationFrame loop driven by an IntersectionObserver.
 * - Layout measurements and responsive framing for video (cover vs 155vw mobile rule).
 * - Video seeking with seeking guard (!video.seeking && diff > 1/60) and re-seek on seeked.
 * - Speed readout: smoothed |dy|/dt / 32, capped at 99, two digits (visible when --ph = 1).
 * - Card reveal: background-clip:text gradient with s computed per card's left position.
 * - All DOM writes via refs (video currentTime, --edge-px, strip/letters transforms, track height, card s).
 * - ZERO React state changes on scroll to guarantee zero re-renders during scrubbing.
 *
 * References:
 * ARCHITECTURE.md Section 25 (25.1 - 25.3, 25.6), D-25, D-26, D-29, D-30, D-32.
 * docs/HERO_SPEC.md.
 */

import { useEffect, useRef } from 'react';
import {
  VIDEO_1080P_URL,
  VIDEO_720P_URL,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_FALLBACK_DURATION,
  BAND_EDGE_FINAL_RATIO,
  SCENE_SPLIT_RATIO,
  MOBILE_EDGE_RATIO,
  MOBILE_WIDTH_MULTIPLIER,
  MOBILE_FRAME_CENTER_RATIO,
  A_VIEWPORTS,
  EASE_FACTOR,
  SETTLE_THRESHOLD,
  MIN_SEEK_DIFF,
  DURATION_SAFETY_OFFSET,
  READOUT_LABEL,
} from '../components/hero/heroConfig';

/**
 * @param {Object} params
 * @param {React.RefObject<HTMLDivElement>} params.trackRef
 * @param {React.RefObject<HTMLDivElement>} params.sceneRef
 * @param {React.RefObject<HTMLVideoElement>} params.videoRef
 * @param {React.RefObject<HTMLDivElement>} params.lettersRef
 * @param {React.RefObject<HTMLDivElement>} params.stripRef
 * @param {React.RefObject<HTMLDivElement>} [params.readoutRef]
 */
export default function useHeroScroll({
  trackRef,
  sceneRef,
  videoRef,
  lettersRef,
  stripRef,
  readoutRef,
}) {
  const curTimeRef = useRef(0);
  const targetTimeRef = useRef(0);
  const isRunningRef = useRef(false);
  const rafIdRef = useRef(null);
  const lastSettledRef = useRef(false);
  const reducedMotionRef = useRef(false);

  // Speed calculation metrics
  const lastScrollYRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const smoothedSpeedRef = useRef(0);

  // Cached card elements and their relative offset inside the strip
  const cardsRef = useRef([]);
  const cardOffsetsRef = useRef([]);

  // Cached layout metrics to avoid reading layout every rAF tick
  const layoutRef = useRef({
    vw: 0,
    vh: 0,
    stripWidth: 0,
    lettersWidth: 0,
    B: 1,
    trackTop: 0,
    videoW: 0,
    videoH: 0,
    videoLeft: 0,
    videoTop: 0,
    edgePx: 0,
  });

  useEffect(() => {
    const track = trackRef.current;
    const scene = sceneRef.current;
    const video = videoRef.current;
    const letters = lettersRef.current;
    const strip = stripRef.current;
    const readout = readoutRef ? readoutRef.current : null;

    if (!track || !scene) return;

    // Check prefers-reduced-motion
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mql.matches;
    const handleMotionChange = (e) => {
      reducedMotionRef.current = e.matches;
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', handleMotionChange);
    } else if (mql.addListener) {
      mql.addListener(handleMotionChange);
    }

    // Source selection: 720p if viewport <= 900px or navigator.connection?.saveData, else 1080p
    const selectVideoSource = () => {
      if (!video) return;
      const isSaveData = Boolean(
        typeof navigator !== 'undefined' &&
          navigator.connection &&
          navigator.connection.saveData
      );
      const isNarrow = window.innerWidth <= 900;
      const expectedSrc = isSaveData || isNarrow ? VIDEO_720P_URL : VIDEO_1080P_URL;

      if (!video.src || !video.src.includes(expectedSrc)) {
        const currentTime = video.currentTime;
        video.src = expectedSrc;
        video.currentTime = currentTime;
        try {
          video.load();
        } catch {
          // Ignore
        }
      }
    };

    selectVideoSource();

    // Sizing, positioning, and track height calculation
    const recomputeLayout = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (!vw || !vh) return;

      // Measure child element widths
      const stripWidth = strip
        ? Math.max(strip.offsetWidth, strip.scrollWidth, strip.getBoundingClientRect().width)
        : 0;
      const lettersWidth = letters
        ? Math.max(letters.offsetWidth, letters.scrollWidth, letters.getBoundingClientRect().width)
        : 0;

      // Cache card elements and their relative horizontal offsets
      if (strip) {
        const cardEls = Array.from(strip.querySelectorAll('.hero-card'));
        cardsRef.current = cardEls;
        cardOffsetsRef.current = cardEls.map((el) => el.offsetLeft);
      }

      // Track height = (1 + A + B) * vh
      // B = (strip width + 0.45 * vw) / vw * 1.1 viewports
      const B = vw > 0 ? ((stripWidth + 0.45 * vw) / vw) * 1.1 : 1;
      const trackHeight = (1 + A_VIEWPORTS + B) * vh;

      // Framing: wide (cover) vs narrow/portrait (155vw rule)
      const isNarrowOrPortrait = vw < 768 || vw <= vh;
      let videoW, videoH, videoLeft, videoTop, edgePx;

      if (isNarrowOrPortrait) {
        videoW = MOBILE_WIDTH_MULTIPLIER * vw;
        videoH = videoW * (VIDEO_HEIGHT / VIDEO_WIDTH);
        videoLeft = 0.5 * vw - MOBILE_FRAME_CENTER_RATIO * videoW;
        edgePx = MOBILE_EDGE_RATIO * vh;
        videoTop = edgePx - BAND_EDGE_FINAL_RATIO * videoH;
      } else {
        const scale = Math.max(vw / VIDEO_WIDTH, vh / VIDEO_HEIGHT);
        videoW = VIDEO_WIDTH * scale;
        videoH = VIDEO_HEIGHT * scale;
        videoLeft = (vw - videoW) / 2;
        videoTop = (vh - videoH) / 2;
        edgePx = videoTop + BAND_EDGE_FINAL_RATIO * videoH;
      }

      // Scene background split line inside clip at 90% of frame height (ARCHITECTURE.md Section 25.6)
      const splitY = videoTop + SCENE_SPLIT_RATIO * videoH;

      // Write values directly to DOM via style properties / CSS variables
      track.style.setProperty('--hero-track-height', `${trackHeight}px`);
      scene.style.setProperty('--edge-px', `${edgePx}px`);
      scene.style.setProperty('--hero-split-y', `${splitY}px`);

      if (video) {
        video.style.width = `${videoW}px`;
        video.style.height = `${videoH}px`;
        video.style.left = `${videoLeft}px`;
        video.style.top = `${videoTop}px`;
      }

      const rect = track.getBoundingClientRect();
      const trackTop = rect.top + window.scrollY;

      layoutRef.current = {
        vw,
        vh,
        stripWidth,
        lettersWidth,
        B,
        trackTop,
        videoW,
        videoH,
        videoLeft,
        videoTop,
        edgePx,
      };

      // Recalculate frame positions immediately with updated metrics
      updateFrame();
    };

    // Calculate scrub progress and write transforms/currentTime
    const updateFrame = () => {
      const { vw, vh, stripWidth, lettersWidth, B, trackTop } = layoutRef.current;
      if (!vh || !vw) return;

      const currentScrollY = window.scrollY;
      const scrollY = Math.max(0, currentScrollY - trackTop);

      // Speed calculation: smoothed |dy|/dt / 32, capped at 99, two digits
      const now = performance.now();
      const prevTime = lastTimestampRef.current || now;
      const dt = (now - prevTime) / 1000;
      lastTimestampRef.current = now;

      const prevScrollY = lastScrollYRef.current;
      lastScrollYRef.current = currentScrollY;

      if (dt > 0.001 && dt < 0.2) {
        const dy = Math.abs(currentScrollY - prevScrollY);
        const instantSpeed = dy / dt / 32;
        smoothedSpeedRef.current += (instantSpeed - smoothedSpeedRef.current) * 0.15;
      } else {
        smoothedSpeedRef.current += (0 - smoothedSpeedRef.current) * 0.15;
      }

      if (smoothedSpeedRef.current < 0.2) {
        smoothedSpeedRef.current = 0;
      }

      if (readout) {
        const speedVal = Math.min(Math.round(smoothedSpeedRef.current), 99);
        const formatted = String(speedVal).padStart(2, '0');
        const text = `${formatted} ${READOUT_LABEL}`;
        if (readout.textContent !== text) {
          readout.textContent = text;
        }
      }

      // 1. Clip scrub progress: q in [0, 1]
      const q = Math.min(Math.max(scrollY / (A_VIEWPORTS * vh), 0), 1);
      const duration =
        video && isFinite(video.duration) && video.duration > 0
          ? video.duration
          : VIDEO_FALLBACK_DURATION;
      const targetTime = q * (duration - DURATION_SAFETY_OFFSET);
      targetTimeRef.current = targetTime;

      // Ease toward target (factor 1 when reduced motion)
      const ease = reducedMotionRef.current ? 1 : EASE_FACTOR;
      curTimeRef.current += (targetTime - curTimeRef.current) * ease;
      if (Math.abs(targetTime - curTimeRef.current) < 0.0001) {
        curTimeRef.current = targetTime;
      }

      // Seek video with guard
      if (video) {
        const diff = Math.abs(curTimeRef.current - video.currentTime);
        if (!video.seeking && diff > MIN_SEEK_DIFF) {
          video.currentTime = curTimeRef.current;
        }
      }

      // 2. Settled flag: --ph = 1 when q >= 0.94
      const isSettled = q >= SETTLE_THRESHOLD;
      if (isSettled !== lastSettledRef.current) {
        lastSettledRef.current = isSettled;
        scene.style.setProperty('--ph', isSettled ? '1' : '0');
      }

      // 3. Horizontal strip & giant letters progress: r in [0, 1]
      const r =
        B * vh > 0 ? Math.min(Math.max((scrollY - A_VIEWPORTS * vh) / (B * vh), 0), 1) : 0;

      // Strip translateX = vw - r * (stripWidth + 0.45 * vw)
      const stripX = vw - r * (stripWidth + 0.45 * vw);

      // Giant letters translateX = vw - r * (lettersWidth + vw)
      const lettersX = vw - r * (lettersWidth + vw);

      if (strip) {
        strip.style.transform = `translate3d(${stripX}px, 0, 0)`;
      }

      if (letters) {
        letters.style.transform = `translate3d(${lettersX}px, 0, 0)`;
        letters.style.visibility = r > 0 ? 'visible' : 'hidden';
      }

      // 4. Card reveal: background-clip:text gradient per spec
      // s = clamp((0.98 - cardLeft/vw) / 0.3, -0.4, 1.6) * 100%
      const cardEls = cardsRef.current;
      const offsets = cardOffsetsRef.current;
      const cardCount = cardEls.length;

      for (let i = 0; i < cardCount; i++) {
        const cardEl = cardEls[i];
        if (!cardEl) continue;

        if (reducedMotionRef.current) {
          cardEl.style.setProperty('--hero-card-s', '160%');
        } else {
          const cardLeft = stripX + (offsets[i] || 0);
          const sRatio = (0.98 - cardLeft / vw) / 0.3;
          const sClamped = Math.min(Math.max(sRatio, -0.4), 1.6);
          const sPercent = sClamped * 100;
          cardEl.style.setProperty('--hero-card-s', `${sPercent.toFixed(2)}%`);
        }
      }
    };

    // Re-seek on seeked handler (per HERO_SPEC.md & D-30)
    const handleSeeked = () => {
      if (!video) return;
      const diff = Math.abs(curTimeRef.current - video.currentTime);
      if (diff > MIN_SEEK_DIFF) {
        video.currentTime = curTimeRef.current;
      }
    };

    if (video) {
      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('loadedmetadata', recomputeLayout);
    }

    // Single rAF loop management
    const loop = () => {
      if (!isRunningRef.current) return;
      updateFrame();
      rafIdRef.current = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (video && video.preload !== 'auto') {
        video.preload = 'auto';
      }
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      rafIdRef.current = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      isRunningRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    // IntersectionObserver: loop runs only while track is near the viewport
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === track) {
            if (entry.isIntersecting) {
              startLoop();
            } else {
              stopLoop();
            }
          }
        }
      },
      {
        rootMargin: '100% 0px 100% 0px',
      }
    );

    observer.observe(track);

    // Initial layout calculation
    recomputeLayout();

    // Recompute on resize, orientationchange, and when web fonts finish loading
    const handleResize = () => {
      selectVideoSource();
      recomputeLayout();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(handleResize);
    }

    return () => {
      stopLoop();
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (video) {
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('loadedmetadata', recomputeLayout);
      }
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handleMotionChange);
      } else if (mql.removeListener) {
        mql.removeListener(handleMotionChange);
      }
    };
  }, [trackRef, sceneRef, videoRef, lettersRef, stripRef, readoutRef]);
}
