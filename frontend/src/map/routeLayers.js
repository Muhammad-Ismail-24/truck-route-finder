/**
 * @file routeLayers.js
 * Source and layer definitions for route polylines in MapLibre.
 *
 * Rules (Section 17.5):
 * - routes-src GeoJSON source updated with setData.
 * - routes-casing below routes-line.
 * - Selected route: full opacity (1.0), 5px width.
 * - Other routes: 55% opacity (0.55), 3px width.
 * - Recommended route: distinct white outline casing.
 *
 * References:
 * ARCHITECTURE.md Section 17.5.
 */

import { EMPTY_GEOJSON } from './geojson';
import { MAP_THEME_COLORS } from '../lib/risk/riskLevels';

export const ROUTES_SOURCE_ID = 'routes-src';
export const ROUTES_CASING_LAYER_ID = 'routes-casing';
export const ROUTES_LINE_LAYER_ID = 'routes-line';

/**
 * Creates dynamic line-width expression based on selected route.
 * @param {string | null} selectedRouteId
 * @returns {any[]}
 */
export function getRouteLineWidthExpression(selectedRouteId) {
  return [
    'case',
    ['==', ['get', 'route_id'], selectedRouteId || ''],
    5,
    3,
  ];
}

/**
 * Creates dynamic line-opacity expression based on selected route.
 * @param {string | null} selectedRouteId
 * @returns {any[]}
 */
export function getRouteLineOpacityExpression(selectedRouteId) {
  return [
    'case',
    ['==', ['get', 'route_id'], selectedRouteId || ''],
    1.0,
    0.55,
  ];
}

/**
 * Creates dynamic casing width expression.
 * @param {string | null} selectedRouteId
 * @returns {any[]}
 */
export function getRouteCasingWidthExpression(selectedRouteId) {
  return [
    'case',
    ['==', ['get', 'route_id'], selectedRouteId || ''],
    9,
    ['get', 'is_recommended'],
    7,
    5,
  ];
}

/**
 * Adds the routes GeoJSON source and line/casing layers to the map.
 * @param {import('maplibre-gl').Map} map
 * @param {string | null} [selectedRouteId=null]
 * @param {string} [beforeLayerId] Layer to insert below (e.g. before checkpoint circles)
 */
export function addRouteLayers(map, selectedRouteId = null, beforeLayerId) {
  if (!map.getSource(ROUTES_SOURCE_ID)) {
    map.addSource(ROUTES_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_GEOJSON,
    });
  }

  // 1. Casing Layer (Contrast and recommended outline)
  if (!map.getLayer(ROUTES_CASING_LAYER_ID)) {
    map.addLayer(
      {
        id: ROUTES_CASING_LAYER_ID,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-width': getRouteCasingWidthExpression(selectedRouteId),
          'line-color': [
            'case',
            ['get', 'is_recommended'],
            MAP_THEME_COLORS.white, // Distinct white outline for recommended route
            MAP_THEME_COLORS.ink, // Contrast dark casing for other routes
          ],
          'line-opacity': getRouteLineOpacityExpression(selectedRouteId),
        },
      },
      beforeLayerId
    );
  }

  // 2. Colored Polyline Layer
  if (!map.getLayer(ROUTES_LINE_LAYER_ID)) {
    map.addLayer(
      {
        id: ROUTES_LINE_LAYER_ID,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': getRouteLineWidthExpression(selectedRouteId),
          'line-opacity': getRouteLineOpacityExpression(selectedRouteId),
        },
      },
      beforeLayerId
    );
  }
}

/**
 * Updates route line styling in place on selection changes without redrawing or re-animating.
 * @param {import('maplibre-gl').Map} map
 * @param {string | null} selectedRouteId
 */
export function updateRouteSelection(map, selectedRouteId) {
  if (!map || !map.isStyleLoaded()) return;

  if (map.getLayer(ROUTES_LINE_LAYER_ID)) {
    map.setPaintProperty(
      ROUTES_LINE_LAYER_ID,
      'line-width',
      getRouteLineWidthExpression(selectedRouteId)
    );
    map.setPaintProperty(
      ROUTES_LINE_LAYER_ID,
      'line-opacity',
      getRouteLineOpacityExpression(selectedRouteId)
    );
  }

  if (map.getLayer(ROUTES_CASING_LAYER_ID)) {
    map.setPaintProperty(
      ROUTES_CASING_LAYER_ID,
      'line-width',
      getRouteCasingWidthExpression(selectedRouteId)
    );
    map.setPaintProperty(
      ROUTES_CASING_LAYER_ID,
      'line-opacity',
      getRouteLineOpacityExpression(selectedRouteId)
    );
  }
}
