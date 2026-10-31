'use client';

/**
 * @file ResultsPanel.jsx
 * Primary results container displaying recommendation banner, route cards,
 * route checkpoints table, and notices.
 *
 * References:
 * ARCHITECTURE.md Section 17.4, 25.5.
 */

import { useTripCore } from '../../state/TripProvider';
import { getSelectedRoute, getRecommendedRoute } from '../../state/selectors';
import RecommendationBanner from './RecommendationBanner';
import NoticesPanel from './NoticesPanel';
import RouteCard from './RouteCard';
import CheckpointTable from './CheckpointTable';

export default function ResultsPanel() {
  const { state, dispatch } = useTripCore();
  const { result, selectedRouteId, selectedCheckpointKey } = state;

  if (!result || !Array.isArray(result.routes) || result.routes.length === 0) {
    return null;
  }

  const routes = result.routes;
  const recommendation = result.recommendation;
  const recommendedRoute = getRecommendedRoute(state);
  const selectedRoute = getSelectedRoute(state) || routes[0];

  return (
    <div className="space-y-5 mt-6" role="region" aria-label="Trip planning results">
      {/* 1. Primary Recommendation Banner */}
      {recommendation && (
        <RecommendationBanner
          recommendation={recommendation}
          recommendedRoute={recommendedRoute}
        />
      )}

      {/* 2. Advisory Notices (if present) */}
      {result.notices && result.notices.length > 0 && (
        <NoticesPanel notices={result.notices} />
      )}

      {/* 3. Three Clickable Route Comparison Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm uppercase tracking-wider text-white">
            COMPARE ROUTES
          </h3>
          <span className="font-mono text-[11px] text-text-muted">
            {routes.length} options evaluated
          </span>
        </div>

        {routes.map((route, i) => (
          <RouteCard
            key={route.id}
            route={route}
            index={i}
            isSelected={selectedRouteId === route.id}
            onClick={() => dispatch({ type: 'ROUTE_SELECTED', payload: route.id })}
          />
        ))}
      </div>

      {/* 4. Checkpoint Sampling Log for Selected Route */}
      {selectedRoute && (
        <div className="pt-2">
          <CheckpointTable
            route={selectedRoute}
            selectedCheckpointKey={selectedCheckpointKey}
            onSelectCheckpoint={(key) => dispatch({ type: 'CHECKPOINT_SELECTED', payload: key })}
          />
        </div>
      )}
    </div>
  );
}
