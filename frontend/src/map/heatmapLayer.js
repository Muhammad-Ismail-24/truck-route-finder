/**
 * @file heatmapLayer.js
 * Source and layer definitions for the GPU weather/risk heatmap overlay.
 *
 * Rules (Section 14 & 17.5):
 * - heatmap-src GeoJSON source updated via setData on slider move.
 * - heatmap-layer placed BELOW route lines (below routes-casing).
 * - heatmap-weight from feature intensity.
 * - Radius interpolated by zoom level.
 * - Color ramp: transparent -> yellow -> orange -> red -> dark red.
 * - Opacity ~0.75 when visible; 0 when hidden.
 * - heatmap-opacity-transition (~300ms) for show/hide toggling ONLY.
 * - No animation or transition on slider data updates.
 *
 * References:
 * ARCHITECTURE.md Section 14, 17.5, 25.5, Decisions D-20, D-28.
 */

import { EMPTY_GEOJSON } from './geojson';
import { ROUTES_CASING_LAYER_ID } from './routeLayers';
import { RISK_LEVELS } from '../lib/risk/riskLevels';

export const HEATMAP_SOURCE_ID = 'heatmap-src';
export const HEATMAP_LAYER_ID = 'heatmap-layer';
export const HEATMAP_DEFAULT_OPACITY = 0.80;

/**
 * Adds the heatmap GeoJSON source and WebGL heatmap layer to the map.
 * Placed below route lines (before routes-casing).
 *
 * @param {import('maplibre-gl').Map} map
 * @param {string} [beforeLayerId=ROUTES_CASING_LAYER_ID]
 * @param {boolean} [initialVisibility=true]
 */
export function addHeatmapLayer(
  map,
  beforeLayerId = ROUTES_CASING_LAYER_ID,
  initialVisibility = true
) {
  if (!map.getSource(HEATMAP_SOURCE_ID)) {
    map.addSource(HEATMAP_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_GEOJSON,
    });
  }

  if (!map.getLayer(HEATMAP_LAYER_ID)) {
    map.addLayer(
      {
        id: HEATMAP_LAYER_ID,
        type: 'heatmap',
        source: HEATMAP_SOURCE_ID,
        paint: {
          // Increase the heatmap weight based on point intensity
          'heatmap-weight': ['get', 'intensity'],

          // Heatmap intensity multiplier across zoom levels
          // Ensures visible baseline at continent scale (zoom ~4) and crisp local density at city scale (zoom ~9)
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1.0,
            4, 1.5,
            9, 2.8,
          ],

          // Color ramp: transparent -> calm green/teal (LOW baseline) -> yellow -> orange -> red -> dark red
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 0, 0)',
            0.15, 'rgba(46, 158, 91, 0.45)',
            0.30, RISK_LEVELS.LOW.fill,
            0.50, RISK_LEVELS.MODERATE.fill,
            0.70, RISK_LEVELS.HIGH.fill,
            0.85, RISK_LEVELS.SEVERE.fill,
            1.00, RISK_LEVELS.NO_TRAVEL.fill,
          ],

          // Interpolated heatmap radius by zoom level
          // At continent scale (zoom ~4), radius ~26px blends 25-mile checkpoints into a smooth corridor swath.
          // At city scale (zoom ~9), radius ~50px forms distinct local hotspot glows.
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            2, 18,
            4, 26,
            7, 38,
            10, 52,
            14, 80,
          ],

          // Transition only applied to opacity for show/hide toggling
          'heatmap-opacity': initialVisibility ? HEATMAP_DEFAULT_OPACITY : 0,
          'heatmap-opacity-transition': { duration: 300 },
        },
      },
      beforeLayerId
    );
  }
}

/**
 * Sets heatmap visibility with smooth 300ms fade transition.
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} isVisible
 */
export function setHeatmapVisibility(map, isVisible) {
  if (!map || !map.isStyleLoaded()) return;

  if (map.getLayer(HEATMAP_LAYER_ID)) {
    map.setPaintProperty(
      HEATMAP_LAYER_ID,
      'heatmap-opacity',
      isVisible ? HEATMAP_DEFAULT_OPACITY : 0
    );
  }
}
