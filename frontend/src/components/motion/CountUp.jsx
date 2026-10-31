'use client';

/**
 * @file CountUp.jsx
 * Animated counter that counts from a start number to a target value.
 * Duration: 600ms with cubic ease-out.
 * Guarantees ending on the exact target value.
 * Immediately displays target value if prefers-reduced-motion is active.
 * Uses font-mono and tabular figures for steady layout.
 *
 * References:
 * ARCHITECTURE.md Section 25.5, Decision D-28.
 */

import { useState, useEffect, useRef } from 'react';
import { easeOutCubic, lerp, MOTION_SLOW_MS } from '../../lib/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Calculates intermediate count-up value at normalized progress [0, 1].
 * @param {number} from
 * @param {number} to
 * @param {number} progress
 * @returns {number}
 */
export function computeCountUpValue(from, to, progress) {
  if (progress >= 1) return to;
  if (progress <= 0) return from;
  return lerp(from, to, easeOutCubic(progress));
}

/**
 * @param {Object} props
 * @param {number} props.value Target value to count up to
 * @param {number} [props.from=0] Initial value
 * @param {number} [props.duration=600] Animation duration in ms
 * @param {(val: number) => string} [props.formatter] Custom formatting function
 * @param {string} [props.className=''] Additional class names
 * @param {React.ElementType} [props.as='span'] HTML tag
 */
export default function CountUp({
  value,
  from = 0,
  duration = MOTION_SLOW_MS,
  formatter = (n) => Math.round(n).toLocaleString(),
  className = '',
  as: Component = 'span',
  ...props
}) {
  const isReducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(from);
  const rafIdRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (isReducedMotion) return;

    startTimeRef.current = performance.now();

    const tick = (currentTime) => {
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const current = computeCountUpValue(from, value, progress);

      setDisplayValue(current);

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayValue(value); // Ensure exact final value
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [value, from, duration, isReducedMotion]);

  const activeNumber = isReducedMotion ? value : displayValue;
  const formattedText = formatter(activeNumber);

  return (
    <Component
      className={`font-mono tabular ${className}`}
      {...props}
    >
      {formattedText}
    </Component>
  );
}
