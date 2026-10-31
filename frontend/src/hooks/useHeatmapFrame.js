'use client';

/**
 * @file useHeatmapFrame.js
 * LRU memoization hook for hourly forecast heatmap frames.
 * Keeps an in-memory cache of up to 8 (hour, metric) GeoJSON frames.
 * Prevents re-computing FeatureCollections when scrubbing back and forth.
 *
 * References:
 * ARCHITECTURE.md Section 17.5.
 */

import { useRef, useCallback, useEffect } from 'react';
import { buildHeatmapGeoJSON, EMPTY_GEOJSON } from '../map/geojson';

/**
 * LRU cache implementation for Heatmap FeatureCollections.
 */
export class HeatmapLruCache {
  /**
   * @param {number} [maxSize=8]
   */
  constructor(maxSize = 8) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * @param {string} key
   * @returns {any | null}
   */
  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    // Refresh entry to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first key in iteration order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * Clears all cached items.
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Returns current cache size.
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }
}

/**
 * Hook providing memoized heatmap GeoJSON frames by (hour, metric).
 *
 * @param {import('../lib/types').HeatmapData} [heatmapData]
 * @returns {{ getFrame: (hour: number, metric: string) => GeoJSON.FeatureCollection<GeoJSON.Point>, clearCache: () => void }}
 */
export function useHeatmapFrame(heatmapData) {
  const cacheRef = useRef(new HeatmapLruCache(8));
  const prevDataRef = useRef(heatmapData);

  // Clear cache if underlying heatmap data changes
  useEffect(() => {
    if (prevDataRef.current !== heatmapData) {
      prevDataRef.current = heatmapData;
      cacheRef.current.clear();
    }
  }, [heatmapData]);

  const getFrame = useCallback(
    (hour = 0, metric = 'RISK') => {
      if (!heatmapData || !Array.isArray(heatmapData.points) || heatmapData.points.length === 0) {
        return EMPTY_GEOJSON;
      }

      const key = `${hour}:${metric}`;
      let frame = cacheRef.current.get(key);
      if (!frame) {
        frame = buildHeatmapGeoJSON(heatmapData, hour, metric);
        cacheRef.current.set(key, frame);
      }
      return frame;
    },
    [heatmapData]
  );

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return { getFrame, clearCache };
}
