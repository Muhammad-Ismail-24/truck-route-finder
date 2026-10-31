/**
 * @file bounds.js
 * Map bounding box calculation and smooth camera fitting.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, 25.5.
 */

import { easeOutCubic } from '../lib/motion';

/**
 * Calculates a bounding box encompassing all coordinates of all provided routes.
 * @param {import('../lib/types').Route[]} [routes=[]]
 * @returns {[[number, number], [number, number]] | null} [[minLng, minLat], [maxLng, maxLat]]
 */
export function calculateRoutesBounds(routes = []) {
  if (!Array.isArray(routes) || routes.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let hasPoints = false;

  for (const route of routes) {
    const coords = route?.geometry?.coordinates;
    if (Array.isArray(coords)) {
      for (const [lng, lat] of coords) {
        if (typeof lng === 'number' && typeof lat === 'number') {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          hasPoints = true;
        }
      }
    }
  }

  if (!hasPoints) return null;

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Fits the MapLibre instance to the provided bounds.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {[[number, number], [number, number]]} bounds
 * @param {Object} [options]
 * @param {boolean} [options.isReducedMotion=false]
 * @param {number | { top: number, bottom: number, left: number, right: number }} [options.padding=60]
 */
export function fitMapToBounds(
  map,
  bounds,
  {
    isReducedMotion = false,
    padding = { top: 60, bottom: 60, left: 60, right: 60 },
  } = {}
) {
  if (!map || !bounds) return;

  const duration = isReducedMotion ? 0 : 900;

  map.fitBounds(bounds, {
    padding,
    duration,
    easing: isReducedMotion ? undefined : easeOutCubic,
    maxZoom: 14,
  });
}
