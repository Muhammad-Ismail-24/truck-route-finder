'use client';

import React, { createContext, useContext, useReducer, useMemo } from 'react';
import { tripReducer, createInitialTripState } from './tripReducer';

const TripContext = createContext(null);

/**
 * TripProvider component managing global trip planner state.
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

  const contextValue = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <TripContext.Provider value={contextValue}>
      {children}
    </TripContext.Provider>
  );
}

/**
 * Hook to access TripContext.
 * @returns {{ state: import('../lib/types').TripState, dispatch: React.Dispatch<any> }}
 */
export function useTrip() {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error('useTrip must be used within a TripProvider');
  }
  return context;
}
