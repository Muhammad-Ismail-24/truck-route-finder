'use client';

/**
 * @file useMapInstance.js
 * Custom hook managing the singleton MapLibre GL JS map instance.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, Decision D-17, D-31.
 */

import { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyleUrl, FALLBACK_MAP_STYLE_URL } from '../map/mapStyle';

// Explicitly configure static same-origin worker URL before any Map is created (Section 17.5)
maplibregl.setWorkerUrl('/maplibre-gl-csp-worker.js');

/**
 * @param {Object} params
 * @param {React.RefObject<HTMLDivElement>} params.containerRef
 * @param {string} [params.initialStyleUrl]
 * @returns {{ map: import('maplibre-gl').Map | null, isLoaded: boolean, mapError: Error | null }}
 */
export function useMapInstance({ containerRef, initialStyleUrl }) {
  const [map, setMap] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const mapRef = useRef(null);
  const hasLoggedErrorRef = useRef(false);
  const fallbackAttemptedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    // Ensure worker URL is set prior to Map construction
    maplibregl.setWorkerUrl('/maplibre-gl-csp-worker.js');

    const styleUrl = initialStyleUrl || getMapStyleUrl();
    let instance = null;

    try {
      instance = new maplibregl.Map({
        container,
        style: styleUrl,
        center: [-98.5795, 39.8283], // Center of contiguous US
        zoom: 3.5,
        cooperativeGestures: true,
        attributionControl: {
          compact: true,
        },
      });
      mapRef.current = instance;

      instance.once('load', () => {
        try {
          instance.resize();
        } catch {
          // Ignore
        }
      });
    } catch (err) {
      if (!hasLoggedErrorRef.current) {
        hasLoggedErrorRef.current = true;
        console.error('Map instantiation error:', err);
      }
      const formattedErr = err instanceof Error ? err : new Error(String(err));
      queueMicrotask(() => {
        setMapError(formattedErr);
      });
      return;
    }

    // Navigation controls in top-right
    instance.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
      }),
      'top-right'
    );

    // Style and worker error handling with fallback
    instance.on('error', (e) => {
      const errMsg = e?.error?.message || (typeof e?.error === 'string' ? e.error : '') || '';
      const isStyleError = errMsg.toLowerCase().includes('style') || e?.status === 404;

      // Style error fallback: attempt fallback style once
      if (isStyleError && !fallbackAttemptedRef.current) {
        fallbackAttemptedRef.current = true;
        console.warn(`Map style error on ${styleUrl}. Falling back to ${FALLBACK_MAP_STYLE_URL}`);
        try {
          instance.setStyle(FALLBACK_MAP_STYLE_URL);
          return;
        } catch {
          // Fall through to error reporting below
        }
      }

      // If map is already loaded and error is an isolated tile fetch, ignore to avoid unmounting canvas
      if (instance.loaded() && e?.tile) {
        return;
      }

      const err = e?.error instanceof Error ? e.error : new Error(errMsg || 'Map failed to load');
      if (!hasLoggedErrorRef.current) {
        hasLoggedErrorRef.current = true;
        console.error('Map error:', err);
      }
      setMapError(err);
    });

    instance.on('load', () => {
      setIsLoaded(true);
      setMap(instance);
    });

    // Resize observer on container to handle frame dimension changes, breakpoint switches, and layout shifts
    const resizeObserver = new ResizeObserver(() => {
      if (instance && typeof instance.resize === 'function') {
        instance.resize();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      setIsLoaded(false);
      setMap(null);
      setMapError(null);
      hasLoggedErrorRef.current = false;
      fallbackAttemptedRef.current = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [containerRef, initialStyleUrl]);

  return { map, isLoaded, mapError };
}
