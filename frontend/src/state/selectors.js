/**
 * Derived state selectors for TripState.
 */

/**
 * Returns all routes from current plan result, or empty array.
 * @param {import('../lib/types').TripState} state
 * @returns {import('../lib/types').Route[]}
 */
export function getAllRoutes(state) {
  return state?.result?.routes || [];
}

/**
 * Returns the currently selected Route object.
 * Defaults to recommended route, then first route, or null.
 * @param {import('../lib/types').TripState} state
 * @returns {import('../lib/types').Route | null}
 */
export function getSelectedRoute(state) {
  const routes = getAllRoutes(state);
  if (!routes.length) return null;

  if (state.selectedRouteId) {
    const match = routes.find((r) => r.id === state.selectedRouteId);
    if (match) return match;
  }

  // Fallback to recommended route
  const recommended = getRecommendedRoute(state);
  if (recommended) return recommended;

  return routes[0] || null;
}

/**
 * Returns the recommended Route object from current plan result.
 * @param {import('../lib/types').TripState} state
 * @returns {import('../lib/types').Route | null}
 */
export function getRecommendedRoute(state) {
  const routes = getAllRoutes(state);
  if (!routes.length) return null;

  const recommendedId = state?.result?.recommendation?.route_id;
  if (recommendedId) {
    const match = routes.find((r) => r.id === recommendedId);
    if (match) return match;
  }

  return routes.find((r) => r.is_recommended) || routes[0] || null;
}

/**
 * Looks up a route by its ID.
 * @param {import('../lib/types').TripState} state
 * @param {string} routeId
 * @returns {import('../lib/types').Route | null}
 */
export function getRouteById(state, routeId) {
  const routes = getAllRoutes(state);
  return routes.find((r) => r.id === routeId) || null;
}

/**
 * Returns the currently selected Checkpoint object.
 * Parses selectedCheckpointKey format: `${routeId}:${index}`
 *
 * @param {import('../lib/types').TripState} state
 * @returns {import('../lib/types').Checkpoint | null}
 */
export function getSelectedCheckpoint(state) {
  const key = state?.selectedCheckpointKey;
  if (!key) return null;

  const colonIdx = key.lastIndexOf(':');
  if (colonIdx === -1) return null;

  const routeId = key.substring(0, colonIdx);
  const index = parseInt(key.substring(colonIdx + 1), 10);
  if (isNaN(index)) return null;

  const route = getRouteById(state, routeId);
  if (!route || !route.checkpoints) return null;

  return route.checkpoints.find((c) => c.index === index) || null;
}

/**
 * Returns recommendation object or null.
 * @param {import('../lib/types').TripState} state
 * @returns {import('../lib/types').Recommendation | null}
 */
export function getRecommendation(state) {
  return state?.result?.recommendation || null;
}

/**
 * Returns notices array or empty list.
 * @param {import('../lib/types').TripState} state
 * @returns {import('../lib/types').Notice[]}
 */
export function getNotices(state) {
  return state?.result?.notices || [];
}

/**
 * Returns heatmap result object or null.
 * @param {import('../lib/types').TripState} state
 * @returns {import('../lib/types').HeatmapResult | null}
 */
export function getHeatmapData(state) {
  return state?.result?.heatmap || null;
}
