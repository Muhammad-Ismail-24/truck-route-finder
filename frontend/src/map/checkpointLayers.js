/**
 * @file checkpointLayers.js
 * Source and layer definitions for checkpoint circle markers in MapLibre.
 *
 * Rules (Section 17.5 & 25.5):
 * - One checkpoints-src GeoJSON source (all routes' checkpoints with props route_id, index, level, label).
 * - Circle color via match expression using RISK_LEVELS palette.
 * - Selected route's checkpoints always visible, other routes' checkpoints hidden below zoom 7 and small otherwise.
 * - checkpoints-selected highlight layer.
 * - No layer re-creation on interaction (update paint properties and filter).
 *
 * References:
 * ARCHITECTURE.md Section 17.5, 25.5.
 */

import { RISK_LEVELS } from '../lib/risk/riskLevels';
import { EMPTY_GEOJSON } from './geojson';

export const CHECKPOINTS_SOURCE_ID = 'checkpoints-src';
export const CHECKPOINTS_CIRCLE_LAYER_ID = 'checkpoints-circle';
export const CHECKPOINTS_SELECTED_LAYER_ID = 'checkpoints-selected';

/**
 * Circle color match expression based on risk level.
 * @returns {any[]}
 */
export function getCheckpointCircleColorExpression() {
  return [
    'match',
    ['get', 'level'],
    'LOW', RISK_LEVELS.LOW.fill,
    'MODERATE', RISK_LEVELS.MODERATE.fill,
    'HIGH', RISK_LEVELS.HIGH.fill,
    'SEVERE', RISK_LEVELS.SEVERE.fill,
    'NO_TRAVEL', RISK_LEVELS.NO_TRAVEL.fill,
    RISK_LEVELS.LOW.fill,
  ];
}

/**
 * Circle radius expression.
 * Selected route: always visible, responsive to zoom.
 * Other routes: hidden (< zoom 7: 0 radius), small otherwise.
 * @param {string | null} selectedRouteId
 * @returns {any[]}
 */
export function getCheckpointCircleRadiusExpression(selectedRouteId) {
  return [
    'case',
    ['==', ['get', 'route_id'], selectedRouteId || ''],
    [
      'interpolate',
      ['linear'],
      ['zoom'],
      4, 4.5,
      8, 6,
      12, 8,
    ],
    [
      'case',
      ['<', ['zoom'], 7],
      0,
      [
        'interpolate',
        ['linear'],
        ['zoom'],
        7, 3,
        12, 4.5,
      ],
    ],
  ];
}

/**
 * Circle opacity expression.
 * Selected route: 1.0. Other routes: hidden below zoom 7, 0.7 otherwise.
 * @param {string | null} selectedRouteId
 * @returns {any[]}
 */
export function getCheckpointCircleOpacityExpression(selectedRouteId) {
  return [
    'case',
    ['==', ['get', 'route_id'], selectedRouteId || ''],
    1.0,
    [
      'case',
      ['<', ['zoom'], 7],
      0,
      0.7,
    ],
  ];
}

/**
 * Stroke width expression.
 * @param {string | null} selectedRouteId
 * @returns {any[]}
 */
export function getCheckpointStrokeWidthExpression(selectedRouteId) {
  return [
    'case',
    ['==', ['get', 'route_id'], selectedRouteId || ''],
    1.5,
    [
      'case',
      ['<', ['zoom'], 7],
      0,
      1,
    ],
  ];
}

/**
 * Stroke color expression. NO_TRAVEL gets a subtle light outline on dark backgrounds.
 * @returns {any[]}
 */
export function getCheckpointStrokeColorExpression() {
  return [
    'case',
    ['==', ['get', 'level'], 'NO_TRAVEL'],
    'rgba(255, 255, 255, 0.65)',
    '#111111',
  ];
}

/**
 * Stroke opacity expression.
 * @param {string | null} selectedRouteId
 * @returns {any[]}
 */
export function getCheckpointStrokeOpacityExpression(selectedRouteId) {
  return [
    'case',
    ['==', ['get', 'route_id'], selectedRouteId || ''],
    0.9,
    [
      'case',
      ['<', ['zoom'], 7],
      0,
      0.6,
    ],
  ];
}

/**
 * Adds the checkpoints GeoJSON source and circle/selected layers to the map.
 * @param {import('maplibre-gl').Map} map
 * @param {string | null} [selectedRouteId=null]
 * @param {string | null} [selectedCheckpointKey=null]
 * @param {string} [beforeLayerId]
 */
export function addCheckpointLayers(
  map,
  selectedRouteId = null,
  selectedCheckpointKey = null,
  beforeLayerId
) {
  if (!map.getSource(CHECKPOINTS_SOURCE_ID)) {
    map.addSource(CHECKPOINTS_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_GEOJSON,
    });
  }

  // 1. Checkpoint circles layer
  if (!map.getLayer(CHECKPOINTS_CIRCLE_LAYER_ID)) {
    map.addLayer(
      {
        id: CHECKPOINTS_CIRCLE_LAYER_ID,
        type: 'circle',
        source: CHECKPOINTS_SOURCE_ID,
        paint: {
          'circle-color': getCheckpointCircleColorExpression(),
          'circle-radius': getCheckpointCircleRadiusExpression(selectedRouteId),
          'circle-opacity': getCheckpointCircleOpacityExpression(selectedRouteId),
          'circle-stroke-width': getCheckpointStrokeWidthExpression(selectedRouteId),
          'circle-stroke-color': getCheckpointStrokeColorExpression(),
          'circle-stroke-opacity': getCheckpointStrokeOpacityExpression(selectedRouteId),
        },
      },
      beforeLayerId
    );
  }

  // 2. Selected checkpoint highlight halo layer
  if (!map.getLayer(CHECKPOINTS_SELECTED_LAYER_ID)) {
    map.addLayer(
      {
        id: CHECKPOINTS_SELECTED_LAYER_ID,
        type: 'circle',
        source: CHECKPOINTS_SOURCE_ID,
        filter: ['==', ['get', 'key'], selectedCheckpointKey || ''],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 7,
            8, 9,
            12, 11,
          ],
          'circle-color': 'transparent',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.95,
        },
      },
      beforeLayerId
    );
  }
}

/**
 * Updates checkpoint styling and selection filter in place without re-creating layers.
 * @param {import('maplibre-gl').Map} map
 * @param {string | null} selectedRouteId
 * @param {string | null} selectedCheckpointKey
 */
export function updateCheckpointSelection(map, selectedRouteId, selectedCheckpointKey) {
  if (!map || !map.isStyleLoaded()) return;

  if (map.getLayer(CHECKPOINTS_CIRCLE_LAYER_ID)) {
    map.setPaintProperty(
      CHECKPOINTS_CIRCLE_LAYER_ID,
      'circle-radius',
      getCheckpointCircleRadiusExpression(selectedRouteId)
    );
    map.setPaintProperty(
      CHECKPOINTS_CIRCLE_LAYER_ID,
      'circle-opacity',
      getCheckpointCircleOpacityExpression(selectedRouteId)
    );
    map.setPaintProperty(
      CHECKPOINTS_CIRCLE_LAYER_ID,
      'circle-stroke-width',
      getCheckpointStrokeWidthExpression(selectedRouteId)
    );
    map.setPaintProperty(
      CHECKPOINTS_CIRCLE_LAYER_ID,
      'circle-stroke-opacity',
      getCheckpointStrokeOpacityExpression(selectedRouteId)
    );
  }

  if (map.getLayer(CHECKPOINTS_SELECTED_LAYER_ID)) {
    map.setFilter(
      CHECKPOINTS_SELECTED_LAYER_ID,
      ['==', ['get', 'key'], selectedCheckpointKey || '']
    );
  }
}
