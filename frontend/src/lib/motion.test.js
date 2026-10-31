import { describe, it, expect } from 'vitest';
import {
  MOTION_FAST_MS,
  MOTION_BASE_MS,
  MOTION_SLOW_MS,
  MOTION_EASE,
  MOTION_EASE_INOUT,
  clamp,
  lerp,
  easeOutCubic,
  easeInOutCubic,
  createCubicBezier,
  ease,
  easeInOut,
} from './motion';

describe('Motion System & Helpers (Section 25.5)', () => {
  it('defines correct motion tokens matching Section 17.7', () => {
    expect(MOTION_FAST_MS).toBe(150);
    expect(MOTION_BASE_MS).toBe(280);
    expect(MOTION_SLOW_MS).toBe(600);
    expect(MOTION_EASE).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
    expect(MOTION_EASE_INOUT).toBe('cubic-bezier(0.4, 0.05, 0.55, 0.95)');
  });

  describe('clamp', () => {
    it('restricts values within [min, max]', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(5, 10, 0)).toBe(5); // Handles inverted bounds
    });
  });

  describe('lerp', () => {
    it('linearly interpolates between two numbers', () => {
      expect(lerp(0, 100, 0)).toBe(0);
      expect(lerp(0, 100, 0.5)).toBe(50);
      expect(lerp(0, 100, 1)).toBe(100);
      expect(lerp(50, 150, 0.25)).toBe(75);
    });
  });

  describe('easing functions', () => {
    it('easeOutCubic bounds and curve', () => {
      expect(easeOutCubic(0)).toBe(0);
      expect(easeOutCubic(1)).toBe(1);
      expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // Ease out starts fast
    });

    it('easeInOutCubic bounds and symmetry', () => {
      expect(easeInOutCubic(0)).toBe(0);
      expect(easeInOutCubic(0.5)).toBe(0.5);
      expect(easeInOutCubic(1)).toBe(1);
    });

    it('createCubicBezier evaluates accurately and handles boundary cases', () => {
      const customEase = createCubicBezier(0.25, 0.1, 0.25, 1);
      expect(customEase(0)).toBe(0);
      expect(customEase(-0.5)).toBe(0);
      expect(customEase(1)).toBe(1);
      expect(customEase(1.5)).toBe(1);

      const mid = customEase(0.5);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
    });

    it('ease and easeInOut bezier functions evaluate curve properly', () => {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(easeInOut(0)).toBe(0);
      expect(easeInOut(1)).toBe(1);
    });
  });
});
