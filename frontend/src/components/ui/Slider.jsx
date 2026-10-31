'use client';

/**
 * @file Slider.jsx
 * Accessible, keyboard-navigable horizontal slider component.
 * Features custom track with cobalt filled progress and focusable thumb.
 *
 * Requirements (Section 17.5 & 25.5):
 * - Hourly steps (default 0..48).
 * - Keyboard navigation: Arrow keys (+/-1h), PageUp/PageDown (+/-6h), Home/End (min/max).
 * - Cobalt fill and thumb.
 * - Smooth pointer/touch dragging.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, 25.5.
 */

import { useRef, useCallback } from 'react';

/**
 * @param {Object} props
 * @param {number} props.value Current value
 * @param {number} [props.min=0] Minimum value
 * @param {number} [props.max=48] Maximum value
 * @param {number} [props.step=1] Step increment
 * @param {(val: number) => void} props.onChange
 * @param {string} [props.ariaLabel='Forecast Hour']
 * @param {string} [props.ariaValueText]
 * @param {string} [props.className='']
 * @param {boolean} [props.disabled=false]
 */
export default function Slider({
  value = 0,
  min = 0,
  max = 48,
  step = 1,
  onChange,
  ariaLabel = 'Forecast Hour',
  ariaValueText,
  className = '',
  disabled = false,
}) {
  const trackRef = useRef(null);

  const clampVal = useCallback((val) => Math.max(min, Math.min(max, val)), [min, max]);

  const updateFromPointer = useCallback(
    (clientX) => {
      if (!trackRef.current || disabled) return;
      const rect = trackRef.current.getBoundingClientRect();
      const fraction = (clientX - rect.left) / rect.width;
      const rawValue = min + fraction * (max - min);
      const stepped = Math.round(rawValue / step) * step;
      const clamped = clampVal(stepped);
      if (clamped !== value) {
        onChange(clamped);
      }
    },
    [min, max, step, value, onChange, disabled, clampVal]
  );

  const handlePointerDown = (e) => {
    if (disabled) return;
    updateFromPointer(e.clientX);

    const onPointerMove = (moveEvent) => {
      updateFromPointer(moveEvent.clientX);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    let newValue = value;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        newValue = clampVal(value + step);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        newValue = clampVal(value - step);
        break;
      case 'PageUp':
        newValue = clampVal(value + step * 6);
        break;
      case 'PageDown':
        newValue = clampVal(value - step * 6);
        break;
      case 'Home':
        newValue = min;
        break;
      case 'End':
        newValue = max;
        break;
      default:
        return;
    }

    e.preventDefault();
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  const percentage = max > min ? ((clampVal(value) - min) / (max - min)) * 100 : 0;

  return (
    <div className={`relative flex items-center select-none py-3 min-h-[44px] ${className}`}>
      {/* Clickable / Draggable Track Area */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        className={`w-full h-2 rounded-full relative cursor-pointer ${
          disabled ? 'bg-surface-3 cursor-not-allowed opacity-50' : 'bg-surface-3'
        }`}
      >
        {/* Filled Progress Bar (Cobalt) */}
        <div
          className="h-full rounded-full bg-cobalt transition-none"
          style={{ width: `${percentage}%` }}
        />

        {/* Thumb with accessible 44px hit target */}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={ariaValueText || `+${value} hours`}
          onKeyDown={handleKeyDown}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-cobalt shadow-md hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-2 focus:ring-offset-ink transition-transform cursor-grab active:cursor-grabbing before:content-[''] before:absolute before:-top-3.5 before:-bottom-3.5 before:-left-3.5 before:-right-3.5 before:rounded-full"
          style={{ left: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
