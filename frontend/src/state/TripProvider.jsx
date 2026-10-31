'use client';

import React, { createContext, useContext, useReducer, useMemo } from 'react';
import { tripReducer, createInitialTripState } from './tripReducer';

const TripContext = createContext(null);
const TripCoreContext = createContext(null);
const HeatmapContext = createContext(null);

/**
 * TripProvider component managing global trip planner state.
 * Splits context between Core trip state and Heatmap state to prevent
 * MapView from re-rendering during 60fps slider dragging (Section 17.5).
 *
 * @param {{ children: React.ReactNode, initialState?: Partial<import('../lib/types').TripState> }} props
 */
export function TripProvider({ children, initialState }) {
  const initial = useMemo(() => {
    const base = createInitialTripState();
    if (!initialState) return base;
    return {
      ...base,
      ...initialState,
      form: { ...base.form, ...(initialState.form || {}) },
      heatmap: { ...base.heatmap, ...(initialState.heatmap || {}) },
    };
  }, [initialState]);

  const [state, dispatch] = useReducer(tripReducer, initial);

  // Memoized core state excluding heatmap slider updates
  const coreState = useMemo(
    () => ({
      form: state.form,
      status: state.status,
      result: state.result,
      error: state.error,
      selectedRouteId: state.selectedRouteId,
      selectedCheckpointKey: state.selectedCheckpointKey,
    }),
    [
      state.form,
      state.status,
      state.result,
      state.error,
      state.selectedRouteId,
      state.selectedCheckpointKey,
    ]
  );

  const fullContextValue = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  const coreContextValue = useMemo(() => ({ state: coreState, dispatch }), [coreState, dispatch]);
  const heatmapContextValue = useMemo(
    () => ({ heatmap: state.heatmap, dispatch }),
    [state.heatmap, dispatch]
  );

  return (
    <TripContext.Provider value={fullContextValue}>
      <TripCoreContext.Provider value={coreContextValue}>
        <HeatmapContext.Provider value={heatmapContextValue}>
          {children}
        </HeatmapContext.Provider>
      </TripCoreContext.Provider>
    </TripContext.Provider>
  );
}

/**
 * Hook to access full TripContext (form, status, result, error, selection, heatmap).
 * @returns {{ state: import('../lib/types').TripState, dispatch: React.Dispatch<any> }}
 */
export function useTrip() {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error('useTrip must be used within a TripProvider');
  }
  return context;
}

/**
 * Hook to access core trip state without subscribing to heatmap slider updates.
 * Used by MapView to guarantee 0 React re-renders while dragging the 48h forecast slider.
 * @returns {{ state: Omit<import('../lib/types').TripState, 'heatmap'>, dispatch: React.Dispatch<any> }}
 */
export function useTripCore() {
  const context = useContext(TripCoreContext);
  if (!context) {
    throw new Error('useTripCore must be used within a TripProvider');
  }
  return context;
}

/**
 * Hook to access heatmap forecast slider state (hour, metric, visible).
 * @returns {{ heatmap: import('../lib/types').HeatmapState, dispatch: React.Dispatch<any> }}
 */
export function useHeatmap() {
  const context = useContext(HeatmapContext);
  if (!context) {
    throw new Error('useHeatmap must be used within a TripProvider');
  }
  return context;
}
