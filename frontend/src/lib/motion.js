/**
 * Motion tokens and mathematical helpers.
 * Mirror of CSS variables in globals.css.
 */

export const MOTION_FAST_MS = 150;
export const MOTION_BASE_MS = 280;
export const MOTION_SLOW_MS = 600;

export const MOTION_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const MOTION_EASE_INOUT = 'cubic-bezier(0.4, 0.05, 0.55, 0.95)';

export const MOTION_TOKENS = {
  fast: MOTION_FAST_MS,
  base: MOTION_BASE_MS,
  slow: MOTION_SLOW_MS,
  ease: MOTION_EASE,
  easeInOut: MOTION_EASE_INOUT,
};

/**
 * Clamps a number between min and max bounds.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  if (min > max) {
    const tmp = min;
    min = max;
    max = tmp;
  }
  return Math.min(Math.max(val, min), max);
}

/**
 * Linearly interpolates between a and b by ratio t.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Standard cubic ease-out function.
 * @param {number} t Progress from 0 to 1
 * @returns {number}
 */
export function easeOutCubic(t) {
  const clamped = clamp(t, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * Standard cubic ease-in-out function.
 * @param {number} t Progress from 0 to 1
 * @returns {number}
 */
export function easeInOutCubic(t) {
  const clamped = clamp(t, 0, 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * Solves a cubic-bezier easing curve for y given x.
 * Based on UnitBezier implementation.
 * @param {number} p1x
 * @param {number} p1y
 * @param {number} p2x
 * @param {number} p2y
 * @returns {(x: number) => number}
 */
export function createCubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  function sampleCurveX(t) {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleCurveY(t) {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleCurveDerivativeX(t) {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  function solveCurveX(x, epsilon = 1e-6) {
    let t0;
    let t1;
    let t2 = x;
    let x2;
    let d2;

    // Newton-Raphson iteration
    for (let i = 0; i < 8; i++) {
      x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < epsilon) return t2;
      d2 = sampleCurveDerivativeX(t2);
      if (Math.abs(d2) < 1e-6) break;
      t2 -= x2 / d2;
    }

    // Fall back to bisection
    t0 = 0;
    t1 = 1;
    t2 = x;

    if (t2 < t0) return t0;
    if (t2 > t1) return t1;

    while (t0 < t1) {
      x2 = sampleCurveX(t2);
      if (Math.abs(x2 - x) < epsilon) return t2;
      if (x > x2) t0 = t2;
      else t1 = t2;
      t2 = (t1 - t0) * 0.5 + t0;
    }

    return t2;
  }

  return function bezierEasing(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleCurveY(solveCurveX(x));
  };
}

export const ease = createCubicBezier(0.22, 1, 0.36, 1);
export const easeInOut = createCubicBezier(0.4, 0.05, 0.55, 0.95);
