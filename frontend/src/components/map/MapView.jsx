'use client';

/**
 * @file MapView.jsx
 * WebGL Map Viewport component using MapLibre GL JS.
 * Manages route layers, selection styling, click events, progressive draw-in,
 * and camera fitBounds.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, 25.5, Decisions D-17, D-28, D-31.
 */

import { useRef, useEffect } from 'react';
import { useTrip } from '../../state/TripProvider';
import { useMapInstance } from '../../hooks/useMapInstance';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  addRouteLayers,
  updateRouteSelection,
  ROUTES_LINE_LAYER_ID,
} from '../../map/routeLayers';
import { calculateRoutesBounds, fitMapToBounds } from '../../map/bounds';
import { animateRouteDrawIn } from '../../map/routeAnimation';

export default function MapView() {
  const containerRef = useRef(null);
  const { state, dispatch } = useTrip();
  const { result, selectedRouteId } = state;
  const isReducedMotion = useReducedMotion();

  const { map, isLoaded } = useMapInstance({ containerRef });
  const lastPlanResultRef = useRef(null);
  const animationRef = useRef(null);

  // Initialize route source and layers when style is loaded
  useEffect(() => {
    if (!map || !isLoaded) return;

    addRouteLayers(map, null);

    const handleRouteClick = (e) => {
      if (e.features && e.features[0]) {
        const routeId = e.features[0].properties?.route_id;
        if (routeId) {
          dispatch({ type: 'ROUTE_SELECTED', payload: routeId });
        }
      }
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', ROUTES_LINE_LAYER_ID, handleRouteClick);
    map.on('mouseenter', ROUTES_LINE_LAYER_ID, handleMouseEnter);
    map.on('mouseleave', ROUTES_LINE_LAYER_ID, handleMouseLeave);

    return () => {
      map.off('click', ROUTES_LINE_LAYER_ID, handleRouteClick);
      map.off('mouseenter', ROUTES_LINE_LAYER_ID, handleMouseEnter);
      map.off('mouseleave', ROUTES_LINE_LAYER_ID, handleMouseLeave);
    };
  }, [map, isLoaded, dispatch]);

  // Handle NEW route planning results (draw-in animation + fitBounds)
  useEffect(() => {
    if (!map || !isLoaded || !result || !Array.isArray(result.routes) || result.routes.length === 0) {
      return;
    }

    // Only run draw-in and camera zoom if this is a newly arrived plan result
    if (result !== lastPlanResultRef.current) {
      lastPlanResultRef.current = result;

      // Fit map camera bounds to all returned routes
      const bounds = calculateRoutesBounds(result.routes);
      if (bounds) {
        fitMapToBounds(map, bounds, { isReducedMotion });
      }

      // Cancel previous animation if active
      if (animationRef.current) {
        animationRef.current.cancel();
      }

      // Start progressive polyline draw-in animation
      animationRef.current = animateRouteDrawIn({
        map,
        routes: result.routes,
        isReducedMotion,
      });
    }
  }, [map, isLoaded, result, isReducedMotion]);

  // Handle route SELECTION change (instant styling update, never triggers animation)
  useEffect(() => {
    if (!map || !isLoaded) return;
    updateRouteSelection(map, selectedRouteId);
  }, [map, isLoaded, selectedRouteId]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        animationRef.current.cancel();
        animationRef.current = null;
      }
    };
  }, []);

  return (
    <div className="w-full h-full relative rounded-[24px] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
