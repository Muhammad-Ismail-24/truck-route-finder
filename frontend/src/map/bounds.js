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
 * Calculates responsive padding for fitBounds to ensure all routes and checkpoints
 * are fully visible within the map frame without being obscured by overlay controls
 * (such as HeatmapControls at the bottom and NavigationControl at top-right).
 *
 * @param {HTMLElement | null} [mapContainer]
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function calculateFitBoundsPadding(mapContainer) {
  if (!mapContainer || typeof mapContainer.getBoundingClientRect !== 'function') {
    return { top: 48, right: 64, bottom: 180, left: 48 };
  }

  const rect = mapContainer.getBoundingClientRect();
  const width = rect.width || mapContainer.clientWidth || 800;
  const height = rect.height || mapContainer.clientHeight || 600;

  // Heatmap controls panel sits in the bottom area (~140-180px tall).
  // On large desktop viewports, reserve ~180px bottom clearance; on compact frames,
  // reserve proportional clearance so the route geometry remains centered in the visible space.
  const bottomClearance = height > 600 ? 180 : Math.max(90, Math.floor(height * 0.28));
  const topClearance = Math.min(60, Math.max(32, Math.floor(height * 0.08)));

  // Navigation controls sit at top-right (~40px + margins).
  const rightClearance = Math.min(70, Math.max(48, Math.floor(width * 0.08)));
  const leftClearance = Math.min(50, Math.max(32, Math.floor(width * 0.06)));

  return {
    top: topClearance,
    right: rightClearance,
    bottom: bottomClearance,
    left: leftClearance,
  };
}

/**
 * Fits the MapLibre instance to the provided bounds.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {[[number, number], [number, number]]} bounds
 * @param {Object} [options]
 * @param {boolean} [options.isReducedMotion=false]
 * @param {number | { top: number, bottom: number, left: number, right: number }} [options.padding]
 */
export function fitMapToBounds(
  map,
  bounds,
  {
    isReducedMotion = false,
    padding,
  } = {}
) {
  if (!map || !bounds) return;

  const resolvedPadding =
    padding !== undefined
      ? padding
      : calculateFitBoundsPadding(map.getContainer ? map.getContainer() : null);

  const duration = isReducedMotion ? 0 : 900;

  map.fitBounds(bounds, {
    padding: resolvedPadding,
    duration,
    easing: isReducedMotion ? undefined : easeOutCubic,
    maxZoom: 14,
  });
}
