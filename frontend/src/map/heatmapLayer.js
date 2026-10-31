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

export const HEATMAP_SOURCE_ID = 'heatmap-src';
export const HEATMAP_LAYER_ID = 'heatmap-layer';
export const HEATMAP_DEFAULT_OPACITY = 0.75;

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
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1,
            9, 3,
          ],

          // Color ramp: transparent -> yellow -> orange -> red -> dark red
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 0, 0)',
            0.2, '#F2C94C',
            0.5, '#F2994A',
            0.8, '#EB5757',
            1.0, '#6B1D1D',
          ],

          // Interpolated heatmap radius by zoom level
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3, 16,
            6, 28,
            10, 48,
            14, 75,
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
