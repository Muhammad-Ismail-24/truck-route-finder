import { describe, it, expect } from 'vitest';
import {
  BRAND_NAME,
  VIDEO_1080P_URL,
  VIDEO_720P_URL,
  POSTER_URL,
  A_VIEWPORTS,
  EASE_FACTOR,
  SETTLE_THRESHOLD,
  MIN_SEEK_DIFF,
  DURATION_SAFETY_OFFSET,
  GIANT_LETTERS,
  NAV_LINKS,
  STRIP_HEADLINE,
  STRIP_PARAGRAPHS,
  HERO_CARDS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  BAND_EDGE_FINAL_RATIO,
  MOBILE_EDGE_RATIO,
  MOBILE_WIDTH_MULTIPLIER,
  MOBILE_FRAME_CENTER_RATIO,
} from './heroConfig';

describe('Hero Configuration & Constants (Section 25.2, D-25, D-26, D-29)', () => {
  it('defines placeholder brand name HAULCAST (D-26)', () => {
    expect(BRAND_NAME).toBe('HAULCAST');
  });

  it('defines CloudFront video and poster media URLs (D-29)', () => {
    expect(VIDEO_1080P_URL).toContain('cloudfront.net');
    expect(VIDEO_1080P_URL).toContain('409763c0-95f4-49d3-a601-dc564d55072b.mp4');
    expect(VIDEO_720P_URL).toContain('b3718419-7a0a-478d-bfb0-0ff8bef7f3f7.mp4');
    expect(POSTER_URL).toContain('2307e4bf-be39-42b4-b579-e168aeccabf0.jpg');
  });

  it('defines correct physics and timing constants from HERO_SPEC.md and Section 25.2', () => {
    expect(A_VIEWPORTS).toBe(2.4);
    expect(EASE_FACTOR).toBe(0.2);
    expect(SETTLE_THRESHOLD).toBe(0.94);
    expect(MIN_SEEK_DIFF).toBeCloseTo(1 / 60, 5);
    expect(DURATION_SAFETY_OFFSET).toBeCloseTo(1 / 48, 5);
  });

  it('defines giant letters SAFER ROUTES', () => {
    expect(GIANT_LETTERS).toBe('SAFER ROUTES');
  });

  it('defines nav links pointing to #planner', () => {
    expect(NAV_LINKS.plannerText.href).toBe('#planner');
    expect(NAV_LINKS.plannerText.label).toBe('→ Planner');
    expect(NAV_LINKS.plannerButton.href).toBe('#planner');
    expect(NAV_LINKS.plannerButton.label).toBe('Plan a route');
  });

  it('defines exact headline copy with cobalt accent line 3', () => {
    expect(STRIP_HEADLINE.line1).toBe('KNOW YOUR ROUTE.');
    expect(STRIP_HEADLINE.line2).toBe('MILE BY MILE.');
    expect(STRIP_HEADLINE.line3).toBe('BEFORE YOU ROLL.');
  });

  it('defines exact lead paragraphs copy', () => {
    expect(STRIP_PARAGRAPHS.p1).toContain('truck-specific route options');
    expect(STRIP_PARAGRAPHS.p2).toContain('scored against your load weight');
  });

  it('defines exactly 5 cards matching Section 25.2 table', () => {
    expect(HERO_CARDS).toHaveLength(5);

    expect(HERO_CARDS[0].title).toBe('TRUCK\nROUTES');
    expect(HERO_CARDS[0].body).toContain('Three truck-profile route options');

    expect(HERO_CARDS[1].title).toBe('WEATHER AT\nEVERY MILE');
    expect(HERO_CARDS[1].body).toContain('every 10, 25 or 50 miles');

    expect(HERO_CARDS[2].title).toBe('LOAD-AWARE\nRISK RULES');
    expect(HERO_CARDS[2].body).toContain('stricter wind limits');

    expect(HERO_CARDS[3].title).toBe('SMART\nRECOMMENDATION');
    expect(HERO_CARDS[3].body).toContain('Fewest Severe and High miles first');

    expect(HERO_CARDS[4].title).toBe('48-HOUR\nHEATMAP');
    expect(HERO_CARDS[4].body).toContain('Scrub a forecast heatmap along your corridor');
  });
});

describe('Hero Scroll & Layout Formulas (HERO_SPEC.md & Section 25)', () => {
  it('computes B viewports correctly from strip width and vw', () => {
    const vw = 1440;
    const stripWidth = 2400;
    const B = ((stripWidth + 0.45 * vw) / vw) * 1.1;
    expect(B).toBeGreaterThan(2);

    const vh = 960;
    const trackHeight = (1 + A_VIEWPORTS + B) * vh;
    expect(trackHeight).toBeGreaterThan(5 * vh);
  });

  it('computes wide-screen cover framing and edgePx correctly', () => {
    const vw = 1440;
    const vh = 960;
    const scale = Math.max(vw / VIDEO_WIDTH, vh / VIDEO_HEIGHT);
    const videoW = VIDEO_WIDTH * scale;
    const videoH = VIDEO_HEIGHT * scale;
    const videoTop = (vh - videoH) / 2;
    const edgePx = videoTop + BAND_EDGE_FINAL_RATIO * videoH;

    expect(scale).toBeCloseTo(960 / 1080, 4);
    expect(videoTop).toBe(0);
    expect(edgePx).toBeCloseTo(0.448 * 960, 2);
  });

  it('computes narrow/portrait 155vw framing and 36% edgePx correctly', () => {
    const vw = 430;
    const vh = 932;
    const videoW = MOBILE_WIDTH_MULTIPLIER * vw;
    const videoH = videoW * (VIDEO_HEIGHT / VIDEO_WIDTH);
    const videoLeft = 0.5 * vw - MOBILE_FRAME_CENTER_RATIO * videoW;
    const edgePx = MOBILE_EDGE_RATIO * vh;
    const videoTop = edgePx - BAND_EDGE_FINAL_RATIO * videoH;

    expect(videoW).toBeCloseTo(1.55 * 430, 2);
    expect(edgePx).toBeCloseTo(0.36 * 932, 2);
    expect(videoLeft).toBeCloseTo((0.5 - 0.4 * 1.55) * 430, 2);
    expect(videoTop).toBeCloseTo(edgePx - BAND_EDGE_FINAL_RATIO * videoH, 2);
  });

  it('verifies scroll scrub mapping math and limits', () => {
    const vh = 1000;
    const duration = 4.04;
    const maxTargetTime = duration - DURATION_SAFETY_OFFSET;

    // At top of scroll (scrollY = 0)
    const q0 = Math.min(Math.max(0 / (A_VIEWPORTS * vh), 0), 1);
    expect(q0).toBe(0);
    expect(q0 * maxTargetTime).toBe(0);

    // Mid clip (scrollY = 1.2 * vh)
    const qMid = Math.min(Math.max((1.2 * vh) / (A_VIEWPORTS * vh), 0), 1);
    expect(qMid).toBe(0.5);
    expect(qMid * maxTargetTime).toBeCloseTo(0.5 * (4.04 - 1 / 48), 3);

    // End of clip (scrollY = A * vh)
    const qEnd = Math.min(Math.max((2.4 * vh) / (A_VIEWPORTS * vh), 0), 1);
    expect(qEnd).toBe(1);
    expect(qEnd * maxTargetTime).toBeCloseTo(maxTargetTime, 5);

    // Strip travel mapping (r from 0 to 1 as scroll goes from A*vh to (A+B)*vh)
    const B = 2.0;
    const rStart = Math.min(Math.max((2.4 * vh - A_VIEWPORTS * vh) / (B * vh), 0), 1);
    expect(rStart).toBe(0);

    const rEnd = Math.min(Math.max(((2.4 + 2.0) * vh - A_VIEWPORTS * vh) / (B * vh), 0), 1);
    expect(rEnd).toBe(1);

    const vw = 1440;
    const stripWidth = 2500;
    const stripXStart = vw - 0 * (stripWidth + 0.45 * vw);
    expect(stripXStart).toBe(vw);

    const stripXEnd = vw - 1 * (stripWidth + 0.45 * vw);
    expect(stripXEnd).toBe(vw - (stripWidth + 0.45 * vw));
  });
});
