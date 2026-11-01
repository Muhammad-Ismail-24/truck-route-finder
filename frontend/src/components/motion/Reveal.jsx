'use client';

/**
 * @file Reveal.jsx
 * Generic reveal animation wrapper using IntersectionObserver.
 * Fades and translates Y (16px -> 0) with --motion-slow ease.
 * Triggers once upon entering view.
 * Renders final state immediately when prefers-reduced-motion is active.
 *
 * References:
 * ARCHITECTURE.md Section 25.5, Decision D-28.
 */

import { useState, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useIsMounted } from '../../hooks/useIsMounted';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {number} [props.delay=0] Delay in ms
 * @param {number} [props.staggerIndex=0] Stagger multiplier step (e.g. index in a list)
 * @param {number} [props.staggerStep=60] Stagger step duration in ms (default 60ms)
 * @param {string} [props.className='']
 * @param {React.ElementType} [props.as='div']
 */
export default function Reveal({
  children,
  delay = 0,
  staggerIndex = 0,
  staggerStep = 60,
  className = '',
  as: Component = 'div',
  ...props
}) {
  const isMounted = useIsMounted();
  const isReducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef(null);

  useEffect(() => {
    if (!isMounted || isReducedMotion) return;

    const element = domRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isMounted, isReducedMotion]);

  // Reduced motion: show final state immediately without transitions (after mount)
  if (isMounted && isReducedMotion) {
    return (
      <Component ref={domRef} className={className} {...props}>
        {children}
      </Component>
    );
  }

  const effectiveDelay = delay + staggerIndex * staggerStep;
  const style = {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(16px)',
    transitionProperty: 'opacity, transform',
    transitionDuration: 'var(--motion-slow, 600ms)',
    transitionTimingFunction: 'var(--motion-ease, cubic-bezier(0.22, 1, 0.36, 1))',
    transitionDelay: `${effectiveDelay}ms`,
    willChange: isVisible ? 'auto' : 'opacity, transform',
  };

  return (
    <Component
      ref={domRef}
      className={className}
      style={style}
      aria-hidden={!isVisible && undefined}
      {...props}
    >
      {children}
    </Component>
  );
}
