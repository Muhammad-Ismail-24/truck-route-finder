/**
 * @file routeAnimation.js
 * Progressive draw-in animation for route polylines.
 *
 * Rules:
 * - Runs on NEW plan only; never on selection changes.
 * - Staggers each route's start by 120ms.
 * - Draws in over ~900ms with ease-out cubic.
 * - Feeds growing coordinate prefixes to routes-src via setData in rAF.
 * - Cleanly cancellable if a new plan or unmount occurs.
 * - Skipped entirely when prefers-reduced-motion is active.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, 25.5.
 */

import { easeOutCubic } from '../lib/motion';
import { buildRoutesGeoJSON } from './geojson';
import { ROUTES_SOURCE_ID } from './routeLayers';

/**
 * Executes progressive polyline draw-in animation for an array of routes.
 *
 * @param {Object} params
 * @param {import('maplibre-gl').Map} params.map
 * @param {import('../lib/types').Route[]} params.routes
 * @param {string} [params.sourceId='routes-src']
 * @param {number} [params.duration=900] Duration per route in ms
 * @param {number} [params.staggerMs=120] Stagger delay between routes in ms
 * @param {boolean} [params.isReducedMotion=false]
 * @param {() => void} [params.onComplete] Callback when animation ends
 * @returns {{ cancel: () => void }}
 */
export function animateRouteDrawIn({
  map,
  routes,
  sourceId = ROUTES_SOURCE_ID,
  duration = 900,
  staggerMs = 120,
  isReducedMotion = false,
  onComplete,
}) {
  if (!map || !Array.isArray(routes) || routes.length === 0) {
    return { cancel: () => {} };
  }

  // Reduced motion: skip animation and push complete GeoJSON immediately
  if (isReducedMotion) {
    const source = map.getSource(sourceId);
    if (source) {
      source.setData(buildRoutesGeoJSON(routes));
    }
    if (onComplete) onComplete();
    return { cancel: () => {} };
  }

  let rafId = null;
  let isCancelled = false;
  const startTime = performance.now();

  const tick = (currentTime) => {
    if (isCancelled) return;

    const source = map.getSource(sourceId);
    if (!source) return;

    const elapsed = currentTime - startTime;
    let allFinished = true;
    const coordinatePrefixes = {};

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const coords = route?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length === 0) continue;

      const totalPoints = coords.length;
      const routeElapsed = elapsed - i * staggerMs;

      if (routeElapsed <= 0) {
        // Not started yet: show minimal valid 2-point prefix
        coordinatePrefixes[route.id] = 2;
        allFinished = false;
      } else if (routeElapsed < duration) {
        // In flight: eased prefix length
        const progress = routeElapsed / duration;
        const eased = easeOutCubic(progress);
        const count = Math.max(2, Math.round(eased * totalPoints));
        coordinatePrefixes[route.id] = count;
        allFinished = false;
      } else {
        // Finished for this route
        coordinatePrefixes[route.id] = totalPoints;
      }
    }

    // Push progressive GeoJSON update to GPU source
    source.setData(buildRoutesGeoJSON(routes, { coordinatePrefixes }));

    if (!allFinished) {
      rafId = requestAnimationFrame(tick);
    } else {
      // Final flush ensuring exact full coordinates
      source.setData(buildRoutesGeoJSON(routes));
      if (onComplete) onComplete();
    }
  };

  rafId = requestAnimationFrame(tick);

  return {
    cancel: () => {
      isCancelled = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
