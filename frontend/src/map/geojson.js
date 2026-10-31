/**
 * @file geojson.js
 * GeoJSON builders for MapLibre sources.
 *
 * References:
 * ARCHITECTURE.md Section 17.5.
 */

import { getRouteColor } from '../lib/risk/riskLevels';

export const EMPTY_GEOJSON = Object.freeze({
  type: 'FeatureCollection',
  features: [],
});

/**
 * Builds a FeatureCollection of LineString features from an array of routes.
 *
 * @param {import('../lib/types').Route[]} [routes=[]]
 * @param {Object} [options]
 * @param {Record<string, number>} [options.coordinatePrefixes] Optional map of routeId -> coordinate count for progressive draw-in
 * @returns {GeoJSON.FeatureCollection<GeoJSON.LineString>}
 */
export function buildRoutesGeoJSON(routes = [], { coordinatePrefixes } = {}) {
  if (!Array.isArray(routes) || routes.length === 0) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  const features = routes
    .filter((route) => route && route.geometry && Array.isArray(route.geometry.coordinates))
    .map((route) => {
      const fullCoords = route.geometry.coordinates;
      let coords = fullCoords;

      if (coordinatePrefixes && coordinatePrefixes[route.id] !== undefined) {
        const targetCount = coordinatePrefixes[route.id];
        if (targetCount <= 1 && fullCoords.length > 0) {
          // LineString requires at least 2 coordinate pairs in GeoJSON
          coords = [fullCoords[0], fullCoords[0]];
        } else {
          coords = fullCoords.slice(0, Math.min(targetCount, fullCoords.length));
        }
      }

      const colorKey = route.label ? route.label.slice(-1) : route.id;
      const color = getRouteColor(route.id || route.label);

      return {
        type: 'Feature',
        id: route.id,
        properties: {
          route_id: route.id,
          color_key: colorKey,
          color,
          is_recommended: Boolean(route.is_recommended),
          label: route.label || route.id,
          rank: route.rank || 0,
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      };
    });

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Builds a FeatureCollection of Point features representing checkpoints across all routes.
 *
 * @param {import('../lib/types').Route[]} [routes=[]]
 * @returns {GeoJSON.FeatureCollection<GeoJSON.Point>}
 */
export function buildCheckpointsGeoJSON(routes = []) {
  if (!Array.isArray(routes) || routes.length === 0) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  const features = [];

  for (const route of routes) {
    if (!route || !Array.isArray(route.checkpoints)) continue;

    for (const cp of route.checkpoints) {
      if (typeof cp.lng !== 'number' || typeof cp.lat !== 'number') continue;

      const key = `${route.id}:${cp.index}`;
      features.push({
        type: 'Feature',
        id: key,
        properties: {
          key,
          route_id: route.id,
          index: cp.index,
          level: cp.risk?.level || 'LOW',
          label: route.label || route.id,
          mile: cp.mile,
          lat: cp.lat,
          lng: cp.lng,
        },
        geometry: {
          type: 'Point',
          coordinates: [cp.lng, cp.lat],
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
