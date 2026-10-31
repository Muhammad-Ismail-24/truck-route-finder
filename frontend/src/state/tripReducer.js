/**
 * Trip planner reducer handling form updates, async fetch cycles,
 * route/checkpoint selections, and heatmap controls (Section 17.2).
 */

import { getDefaultDepartureDateTimeLocal } from '../lib/format/time';

/**
 * Creates a fresh initial state.
 * @returns {import('../lib/types').TripState}
 */
export function createInitialTripState() {
  return {
    form: {
      origin: null,
      destination: null,
      departure_local: getDefaultDepartureDateTimeLocal(),
      load_weight_lb: 40000,
      checkpoint_interval_miles: 25,
    },
    status: 'idle',
    result: null,
    error: null,
    selectedRouteId: null,
    selectedCheckpointKey: null,
    heatmap: {
      visible: true,
      hour: 0,
      metric: 'RISK',
    },
  };
}

export const INITIAL_TRIP_STATE = createInitialTripState();

/**
 * @param {import('../lib/types').TripState} state
 * @param {{ type: string, payload?: any }} action
 * @returns {import('../lib/types').TripState}
 */
export function tripReducer(state, action) {
  switch (action.type) {
    case 'FORM_CHANGED': {
      return {
        ...state,
        form: {
          ...state.form,
          ...action.payload,
        },
      };
    }

    case 'PLAN_REQUESTED': {
      return {
        ...state,
        status: 'loading',
        error: null,
      };
    }

    case 'PLAN_SUCCEEDED': {
      const planResponse = action.payload;
      const recommendedId =
        planResponse?.recommendation?.route_id ||
        planResponse?.routes?.[0]?.id ||
        null;

      return {
        ...state,
        status: 'success',
        result: planResponse,
        error: null,
        selectedRouteId: recommendedId,
        selectedCheckpointKey: null,
        heatmap: {
          ...state.heatmap,
          hour: 0,
        },
      };
    }

    case 'PLAN_FAILED': {
      return {
        ...state,
        status: 'error',
        error: action.payload || { code: 'UNKNOWN_ERROR', message: 'Failed to plan route' },
      };
    }

    case 'ROUTE_SELECTED': {
      return {
        ...state,
        selectedRouteId: action.payload,
        selectedCheckpointKey: null,
      };
    }

    case 'CHECKPOINT_SELECTED': {
      return {
        ...state,
        selectedCheckpointKey: action.payload,
      };
    }

    case 'HEATMAP_HOUR_SET': {
      const hour = typeof action.payload === 'number' ? action.payload : Number(action.payload);
      return {
        ...state,
        heatmap: {
          ...state.heatmap,
          hour: Math.max(0, Math.min(48, isNaN(hour) ? 0 : hour)),
        },
      };
    }

    case 'HEATMAP_METRIC_SET': {
      return {
        ...state,
        heatmap: {
          ...state.heatmap,
          metric: action.payload,
        },
      };
    }

    case 'HEATMAP_VISIBILITY_SET': {
      return {
        ...state,
        heatmap: {
          ...state.heatmap,
          visible: Boolean(action.payload),
        },
      };
    }

    default:
      return state;
  }
}
