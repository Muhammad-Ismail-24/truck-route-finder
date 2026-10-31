'use client';

/**
 * @file useGeocodeSuggest.js
 * Custom hook for debounced address and city suggestions.
 * Manages request cancellation via AbortController.
 *
 * References:
 * ARCHITECTURE.md Section 17.3, 17.6.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { suggestPlaces } from '../lib/api/geocode';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * @param {string} rawQuery User's current typing string
 * @param {Object} [options]
 * @param {number} [options.debounceMs=300]
 * @param {number} [options.minChars=2] Minimum characters before requesting
 * @param {boolean} [options.enabled=true]
 * @returns {{
 *   suggestions: import('../lib/types').Place[],
 *   loading: boolean,
 *   error: Error | null,
 *   clearSuggestions: () => void
 * }}
 */
export function useGeocodeSuggest(
  rawQuery,
  { debounceMs = 300, minChars = 2, enabled = true } = {}
) {
  const debouncedQuery = useDebouncedValue(rawQuery?.trim() || '', debounceMs);
  const [dataState, setDataState] = useState({
    query: '',
    suggestions: [],
    error: null,
  });

  const abortControllerRef = useRef(null);

  const clearSuggestions = useCallback(() => {
    setDataState({
      query: '',
      suggestions: [],
      error: null,
    });
  }, []);

  const shouldFetch = enabled && debouncedQuery.length >= minChars;
  const isLoading = shouldFetch && dataState.query !== debouncedQuery;

  useEffect(() => {
    if (!shouldFetch) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let isCancelled = false;

    suggestPlaces(debouncedQuery, { signal: controller.signal })
      .then((data) => {
        if (!isCancelled && !controller.signal.aborted) {
          setDataState({
            query: debouncedQuery,
            suggestions: Array.isArray(data?.results) ? data.results : [],
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!isCancelled && !controller.signal.aborted) {
          setDataState({
            query: debouncedQuery,
            suggestions: [],
            error: err,
          });
        }
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [debouncedQuery, shouldFetch]);

  return {
    suggestions: shouldFetch ? dataState.suggestions : [],
    loading: isLoading,
    error: shouldFetch ? dataState.error : null,
    clearSuggestions,
  };
}
