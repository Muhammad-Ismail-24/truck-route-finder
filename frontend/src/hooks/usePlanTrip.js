'use client';

/**
 * @file usePlanTrip.js
 * Custom hook to execute trip planning requests.
 * Manages in-flight request cancellation via AbortController and
 * dispatches state transitions into the TripProvider context.
 *
 * References:
 * ARCHITECTURE.md Section 17.2, 17.3, 17.6.
 */

import { useRef, useCallback, useEffect } from 'react';
import { useTrip } from '../state/TripProvider';
import { planTrip } from '../lib/api/plan';
import { dateTimeLocalToIso } from '../lib/format/time';

export function usePlanTrip() {
  const { state, dispatch } = useTrip();
  const abortControllerRef = useRef(null);

  const cancelPlan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const submitPlan = useCallback(
    async (customForm) => {
      const activeForm = customForm || state.form;

      // Validate required inputs
      if (!activeForm.origin || !activeForm.destination) {
        return { success: false, error: 'Origin and destination are required' };
      }

      // Abort previous in-flight request before launching new one (Section 17.3)
      cancelPlan();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      dispatch({ type: 'PLAN_REQUESTED' });

      try {
        const payload = {
          origin: {
            label: activeForm.origin.label,
            lat: activeForm.origin.lat,
            lng: activeForm.origin.lng,
          },
          destination: {
            label: activeForm.destination.label,
            lat: activeForm.destination.lat,
            lng: activeForm.destination.lng,
          },
          departure_time: dateTimeLocalToIso(activeForm.departure_local),
          load_weight_lb: Math.round(Number(activeForm.load_weight_lb)),
          checkpoint_interval_miles: Number(activeForm.checkpoint_interval_miles) || 25,
        };

        const result = await planTrip(payload, { signal: controller.signal });

        if (!controller.signal.aborted) {
          dispatch({ type: 'PLAN_SUCCEEDED', payload: result });
          return { success: true, data: result };
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const errorPayload = {
            code: err.code || 'PLAN_REQUEST_FAILED',
            message: err.message || 'An error occurred while calculating the route plan',
            details: err.details || null,
          };
          dispatch({ type: 'PLAN_FAILED', payload: errorPayload });
          return { success: false, error: errorPayload };
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }

      return { success: false, error: 'Request was cancelled' };
    },
    [state.form, dispatch, cancelPlan]
  );

  useEffect(() => {
    return () => {
      cancelPlan();
    };
  }, [cancelPlan]);

  return {
    submitPlan,
    cancelPlan,
    status: state.status,
    loading: state.status === 'loading',
    result: state.result,
    error: state.error,
  };
}
