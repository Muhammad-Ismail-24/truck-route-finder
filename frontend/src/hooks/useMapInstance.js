'use client';

/**
 * @file useMapInstance.js
 * Custom hook managing the singleton MapLibre GL JS map instance.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, Decision D-17, D-31.
 */

import { useState, useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyleUrl, FALLBACK_MAP_STYLE_URL } from '../map/mapStyle';

/**
 * @param {Object} params
 * @param {React.RefObject<HTMLDivElement>} params.containerRef
 * @param {string} [params.initialStyleUrl]
 * @returns {{ map: import('maplibre-gl').Map | null, isLoaded: boolean }}
 */
export function useMapInstance({ containerRef, initialStyleUrl }) {
  const [map, setMap] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const styleUrl = initialStyleUrl || getMapStyleUrl();

    const instance = new MapLibreMap({
      container,
      style: styleUrl,
      center: [-98.5795, 39.8283], // Center of contiguous US
      zoom: 3.5,
      attributionControl: {
        compact: false,
      },
    });

    mapRef.current = instance;

    // Navigation controls in top-right
    instance.addControl(
      new NavigationControl({
        showCompass: true,
        showZoom: true,
      }),
      'top-right'
    );

    // Style error fallback
    instance.on('error', (e) => {
      if (e?.error?.message?.includes('style') || e?.status === 404) {
        console.warn(`Map style error on ${styleUrl}. Falling back to ${FALLBACK_MAP_STYLE_URL}`);
        instance.setStyle(FALLBACK_MAP_STYLE_URL);
      }
    });

    instance.on('load', () => {
      setIsLoaded(true);
      setMap(instance);
    });

    // Resize observer on container to handle sidebar opening/closing
    const resizeObserver = new ResizeObserver(() => {
      if (instance && instance.loaded()) {
        instance.resize();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      setIsLoaded(false);
      setMap(null);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [containerRef, initialStyleUrl]);

  return { map, isLoaded };
}
