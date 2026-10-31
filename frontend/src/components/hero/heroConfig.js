/**
 * @file heroConfig.js
 * Configuration constants and copy for the landing scroll hero.
 * Single source of truth for hero copy, media URLs, and motion timing.
 * Reference: ARCHITECTURE.md Section 25.2 and docs/HERO_SPEC.md.
 */

// Brand
export const BRAND_NAME = 'HAULCAST';

// Media Assets (CloudFront URLs per HERO_SPEC.md and D-29)
export const VIDEO_1080P_URL =
  'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/409763c0-95f4-49d3-a601-dc564d55072b.mp4';
export const VIDEO_720P_URL =
  'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/b3718419-7a0a-478d-bfb0-0ff8bef7f3f7.mp4';
export const POSTER_URL =
  'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/2307e4bf-be39-42b4-b579-e168aeccabf0.jpg';

// Video clip dimensions
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FALLBACK_DURATION = 4.04; // Continuous 4.04s shot at 24fps

// Sizing & Framing Constants
export const BAND_EDGE_FINAL_RATIO = 0.448; // By 3.75s the band edge sits at 44.8% of frame height
export const SCENE_SPLIT_RATIO = 0.90; // Scene background split line inside clip at 90% of frame height
export const MOBILE_EDGE_RATIO = 0.36; // Band edge lands at 36% of viewport on phones
export const MOBILE_WIDTH_MULTIPLIER = 1.55; // 155vw rule for mobile/portrait
export const MOBILE_FRAME_CENTER_RATIO = 0.4; // 40% of frame sits at mid-screen

// Timing & Physics Constants
export const A_VIEWPORTS = 2.4; // Viewports reserved for clip scrub
export const EASE_FACTOR = 0.2; // cur += (target - cur) * 0.2
export const SETTLE_THRESHOLD = 0.94; // q >= 0.94 sets --ph = 1
export const MIN_SEEK_DIFF = 1 / 60; // Skip seek if |currentTime - target| <= 1/60s
export const DURATION_SAFETY_OFFSET = 1 / 48; // target = q * (duration - 1/48)
export const FALLBACK_TRACK_HEIGHT_VH = 600; // CSS min-height fallback before JS runs

// Copy overrides per Section 25.2
export const GIANT_LETTERS = 'SAFER ROUTES';

export const NAV_LINKS = {
  plannerText: {
    label: '→ Planner',
    href: '#planner',
  },
  plannerButton: {
    label: 'Plan a route',
    href: '#planner',
  },
};

export const BOTTOM_PILL_TEXT = 'Plan a route';
export const READOUT_LABEL = 'MPH';

export const STRIP_HEADLINE = {
  line1: 'KNOW YOUR ROUTE.',
  line2: 'MILE BY MILE.',
  line3: 'BEFORE YOU ROLL.',
};

export const STRIP_PARAGRAPHS = {
  p1: 'We pull truck-specific route options, then check the forecast at your estimated arrival time at every checkpoint along the way.',
  p2: 'Wind, rain and snow are scored against your load weight, so the recommendation fits your truck, not a generic car.',
};

export const HERO_CARDS = [
  {
    id: 1,
    icon: 'route',
    title: 'TRUCK\nROUTES',
    body: 'Three truck-profile route options per trip, compared side by side on one map.',
  },
  {
    id: 2,
    icon: 'weather',
    title: 'WEATHER AT\nEVERY MILE',
    body: 'Wind, rain and snow forecast for your arrival time, every 10, 25 or 50 miles.',
  },
  {
    id: 3,
    icon: 'scale',
    title: 'LOAD-AWARE\nRISK RULES',
    body: 'Heavier loads trigger stricter wind limits, scored from Low to No Travel.',
  },
  {
    id: 4,
    icon: 'shield',
    title: 'SMART\nRECOMMENDATION',
    body: 'Fewest Severe and High miles first, then average risk, then travel time.',
  },
  {
    id: 5,
    icon: 'heatmap',
    title: '48-HOUR\nHEATMAP',
    body: 'Scrub a forecast heatmap along your corridor to find the safest window.',
  },
];
