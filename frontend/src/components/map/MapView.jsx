'use client';

/**
 * @file MapView.jsx
 * WebGL Map Viewport component using MapLibre GL JS.
 * Manages route layers, checkpoint layers, selection styling, click events,
 * progressive draw-in, camera fitBounds, selected pulse marker, and checkpoint popup.
 *
 * References:
 * ARCHITECTURE.md Section 17.5, 25.5, Decisions D-17, D-28, D-31.
 */

import { useRef, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Marker as MapLibreMarker, Popup as MapLibrePopup } from 'maplibre-gl';
import { useTripCore, useHeatmap } from '../../state/TripProvider';
import { useMapInstance } from '../../hooks/useMapInstance';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  addRouteLayers,
  updateRouteSelection,
  ROUTES_SOURCE_ID,
  ROUTES_CASING_LAYER_ID,
  ROUTES_LINE_LAYER_ID,
} from '../../map/routeLayers';
import {
  addCheckpointLayers,
  updateCheckpointSelection,
  CHECKPOINTS_SOURCE_ID,
  CHECKPOINTS_CIRCLE_LAYER_ID,
} from '../../map/checkpointLayers';
import {
  addHeatmapLayer,
  HEATMAP_SOURCE_ID,
} from '../../map/heatmapLayer';
import { calculateRoutesBounds, fitMapToBounds } from '../../map/bounds';
import { animateRouteDrawIn } from '../../map/routeAnimation';
import {
  buildRoutesGeoJSON,
  buildCheckpointsGeoJSON,
  buildHeatmapGeoJSON,
  EMPTY_GEOJSON,
} from '../../map/geojson';
import { getRiskLevel } from '../../lib/risk/riskLevels';
import CheckpointPopup from './CheckpointPopup';
import HeatmapControls from './HeatmapControls';
import './map.css';

/**
 * Isolated overlay subscriber to HeatmapContext.
 * Ensures that slider drags re-render only this controls container,
 * leaving MapView unrendered (Section 17.5).
 */
function HeatmapControlsContainer({ map, heatmapData }) {
  const { heatmap, dispatch } = useHeatmap();

  return (
    <HeatmapControls
      map={map}
      heatmapData={heatmapData}
      visible={heatmap.visible}
      hour={heatmap.hour}
      metric={heatmap.metric}
      dispatch={dispatch}
    />
  );
}

export default function MapView() {
  const containerRef = useRef(null);
  const { state, dispatch } = useTripCore();
  const { result, selectedRouteId, selectedCheckpointKey } = state;
  const isReducedMotion = useReducedMotion();

  const { map, isLoaded } = useMapInstance({ containerRef });
  const lastPlanResultRef = useRef(null);
  const animationRef = useRef(null);
  const pulseMarkerRef = useRef(null);
  const popupRef = useRef(null);
  const popupRootRef = useRef(null);
  const selectedRouteIdRef = useRef(selectedRouteId);

  // Sync selectedRouteIdRef safely inside effect for click handlers
  useEffect(() => {
    selectedRouteIdRef.current = selectedRouteId;
  }, [selectedRouteId]);

  // Derived selected checkpoint object
  const selectedCheckpoint = useMemo(() => {
    if (!selectedCheckpointKey || !result?.routes) return null;
    const colonIdx = selectedCheckpointKey.lastIndexOf(':');
    if (colonIdx === -1) return null;
    const routeId = selectedCheckpointKey.substring(0, colonIdx);
    const index = parseInt(selectedCheckpointKey.substring(colonIdx + 1), 10);
    if (isNaN(index)) return null;

    const route = result.routes.find((r) => r.id === routeId);
    if (!route?.checkpoints) return null;
    const cp = route.checkpoints.find((c) => c.index === index);
    return cp ? { ...cp, route } : null;
  }, [selectedCheckpointKey, result]);

  // Initialize heatmap, route and checkpoint sources and layers when style is loaded
  useEffect(() => {
    if (!map || !isLoaded) return;

    // 0. Add heatmap layer (placed below routes-casing)
    addHeatmapLayer(map, ROUTES_CASING_LAYER_ID, true);

    // 1. Add route line layers
    addRouteLayers(map, null);

    // 2. Add checkpoint circle and selected layers (above routes-line)
    addCheckpointLayers(map, null, null);

    // Click handler for route line
    const handleRouteClick = (e) => {
      if (e.originalEvent?._checkpointHandled) return;
      if (e.originalEvent) {
        e.originalEvent._routeHandled = true;
      }
      if (e.features && e.features[0]) {
        const routeId = e.features[0].properties?.route_id;
        if (routeId) {
          dispatch({ type: 'ROUTE_SELECTED', payload: routeId });
        }
      }
    };

    // Click handler for checkpoints
    const handleCheckpointClick = (e) => {
      if (e.originalEvent) {
        e.originalEvent._checkpointHandled = true;
      }
      if (e.features && e.features[0]) {
        const props = e.features[0].properties;
        if (props?.key) {
          if (props.route_id && props.route_id !== selectedRouteIdRef.current) {
            dispatch({ type: 'ROUTE_SELECTED', payload: props.route_id });
          }
          dispatch({ type: 'CHECKPOINT_SELECTED', payload: props.key });
        }
      }
    };

    // Map background click handler (dismisses checkpoint selection)
    const handleMapClick = (e) => {
      if (e.originalEvent?._checkpointHandled || e.originalEvent?._routeHandled) return;
      dispatch({ type: 'CHECKPOINT_SELECTED', payload: null });
    };

    // Hover cursor handlers
    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', ROUTES_LINE_LAYER_ID, handleRouteClick);
    map.on('mouseenter', ROUTES_LINE_LAYER_ID, handleMouseEnter);
    map.on('mouseleave', ROUTES_LINE_LAYER_ID, handleMouseLeave);

    map.on('click', CHECKPOINTS_CIRCLE_LAYER_ID, handleCheckpointClick);
    map.on('mouseenter', CHECKPOINTS_CIRCLE_LAYER_ID, handleMouseEnter);
    map.on('mouseleave', CHECKPOINTS_CIRCLE_LAYER_ID, handleMouseLeave);

    map.on('click', handleMapClick);

    return () => {
      map.off('click', ROUTES_LINE_LAYER_ID, handleRouteClick);
      map.off('mouseenter', ROUTES_LINE_LAYER_ID, handleMouseEnter);
      map.off('mouseleave', ROUTES_LINE_LAYER_ID, handleMouseLeave);

      map.off('click', CHECKPOINTS_CIRCLE_LAYER_ID, handleCheckpointClick);
      map.off('mouseenter', CHECKPOINTS_CIRCLE_LAYER_ID, handleMouseEnter);
      map.off('mouseleave', CHECKPOINTS_CIRCLE_LAYER_ID, handleMouseLeave);

      map.off('click', handleMapClick);
    };
  }, [map, isLoaded, dispatch]);

  // Handle NEW route planning results (draw-in animation + fitBounds + checkpoint data)
  useEffect(() => {
    if (!map || !isLoaded || !result || !Array.isArray(result.routes) || result.routes.length === 0) {
      return;
    }

    // Populate checkpoints GeoJSON source
    const cpSource = map.getSource(CHECKPOINTS_SOURCE_ID);
    if (cpSource) {
      cpSource.setData(buildCheckpointsGeoJSON(result.routes));
    }

    // Populate heatmap GeoJSON source with initial frame
    const hmSource = map.getSource(HEATMAP_SOURCE_ID);
    if (hmSource) {
      if (result.heatmap && Array.isArray(result.heatmap.points)) {
        hmSource.setData(buildHeatmapGeoJSON(result.heatmap, 0, 'RISK'));
      } else {
        hmSource.setData(EMPTY_GEOJSON);
      }
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
    } else {
      // If remounted with existing result, ensure route lines are drawn
      const routesSource = map.getSource(ROUTES_SOURCE_ID);
      if (routesSource) {
        routesSource.setData(buildRoutesGeoJSON(result.routes));
      }
    }
  }, [map, isLoaded, result, isReducedMotion]);

  // Handle route and checkpoint SELECTION changes (instant styling update, never triggers animation)
  useEffect(() => {
    if (!map || !isLoaded) return;
    updateRouteSelection(map, selectedRouteId);
    updateCheckpointSelection(map, selectedRouteId, selectedCheckpointKey);
  }, [map, isLoaded, selectedRouteId, selectedCheckpointKey]);

  // Handle DOM pulse marker and MapLibre Popup for selected checkpoint
  useEffect(() => {
    if (!map || !isLoaded) return;

    // Clean up previous pulse marker
    if (pulseMarkerRef.current) {
      pulseMarkerRef.current.remove();
      pulseMarkerRef.current = null;
    }

    // Clean up previous popup and root
    if (popupRootRef.current) {
      popupRootRef.current.unmount();
      popupRootRef.current = null;
    }
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    if (!selectedCheckpoint) {
      return;
    }

    // 1. Create pulsing DOM marker at selected checkpoint
    const markerEl = document.createElement('div');
    markerEl.className = 'checkpoint-pulse-marker';
    markerEl.setAttribute('aria-hidden', 'true');

    const ringEl = document.createElement('div');
    ringEl.className = isReducedMotion
      ? 'checkpoint-pulse-ring checkpoint-pulse-reduced'
      : 'checkpoint-pulse-ring';

    const dotEl = document.createElement('div');
    dotEl.className = 'checkpoint-pulse-dot';

    const riskMeta = getRiskLevel(selectedCheckpoint.risk?.level);
    markerEl.style.setProperty('--pulse-color', riskMeta.fill || '#2f63ff');

    markerEl.appendChild(ringEl);
    markerEl.appendChild(dotEl);

    const marker = new MapLibreMarker({
      element: markerEl,
      anchor: 'center',
    })
      .setLngLat([selectedCheckpoint.lng, selectedCheckpoint.lat])
      .addTo(map);

    pulseMarkerRef.current = marker;

    // Smoothly pan camera to center on selected checkpoint (instant under reduced motion)
    map.easeTo({
      center: [selectedCheckpoint.lng, selectedCheckpoint.lat],
      duration: isReducedMotion ? 0 : 600,
    });

    // 2. Create MapLibre Popup at selected checkpoint
    const popupHostNode = document.createElement('div');
    popupHostNode.className = 'checkpoint-popup-host';

    const root = createRoot(popupHostNode);
    root.render(
      <CheckpointPopup
        checkpoint={selectedCheckpoint}
        route={selectedCheckpoint.route}
        onClose={() => dispatch({ type: 'CHECKPOINT_SELECTED', payload: null })}
      />
    );
    popupRootRef.current = root;

    const popup = new MapLibrePopup({
      closeButton: false,
      closeOnClick: false,
      className: 'custom-checkpoint-popup',
      offset: [0, -14],
      maxWidth: '340px',
    })
      .setDOMContent(popupHostNode)
      .setLngLat([selectedCheckpoint.lng, selectedCheckpoint.lat])
      .addTo(map);

    popupRef.current = popup;

    return () => {
      if (pulseMarkerRef.current) {
        pulseMarkerRef.current.remove();
        pulseMarkerRef.current = null;
      }
      if (popupRootRef.current) {
        popupRootRef.current.unmount();
        popupRootRef.current = null;
      }
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map, isLoaded, selectedCheckpoint, isReducedMotion, dispatch]);

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
      {result?.heatmap && (
        <HeatmapControlsContainer map={map} heatmapData={result.heatmap} />
      )}
    </div>
  );
}
