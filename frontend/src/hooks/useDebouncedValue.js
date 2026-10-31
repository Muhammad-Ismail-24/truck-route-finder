'use client';

import { useState, useEffect } from 'react';

/**
 * Returns a debounced version of the provided value.
 *
 * @template T
 * @param {T} value
 * @param {number} [delayMs=300]
 * @returns {T}
 */
export function useDebouncedValue(value, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
