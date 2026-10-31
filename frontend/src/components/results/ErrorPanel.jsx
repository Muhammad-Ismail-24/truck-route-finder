'use client';

/**
 * @file ErrorPanel.jsx
 * Displays API planning error messages mapped from error codes to human-friendly text.
 * Provides a retry button triggering re-execution of the trip plan.
 *
 * References:
 * ARCHITECTURE.md Section 15.4, 17.4.
 */

import Button from '../ui/Button';
import { usePlanTrip } from '../../hooks/usePlanTrip';

const ERROR_CODE_MAP = {
  VALIDATION_ERROR: {
    title: 'Invalid Trip Details',
    message: 'Please review your departure date/time, cargo weight, and location selections.',
  },
  NO_ROUTE_FOUND: {
    title: 'No Truck Route Found',
    message: 'Unable to calculate a viable commercial truck route between these locations. Try adjusting your origin or destination.',
  },
  UPSTREAM_ROUTING_ERROR: {
    title: 'Routing Service Unavailable',
    message: 'The commercial routing provider encountered a temporary error. Please try again in a few moments.',
  },
  UPSTREAM_WEATHER_ERROR: {
    title: 'Weather Service Unavailable',
    message: 'Unable to retrieve forecast data along the route corridor. Please check your network and retry.',
  },
  RATE_LIMITED: {
    title: 'Request Limit Reached',
    message: 'Too many requests were sent in a short window. Please wait a minute before requesting another plan.',
  },
  INTERNAL_ERROR: {
    title: 'Unexpected Server Error',
    message: 'An internal error occurred while processing your trip request. Our engineers have been alerted.',
  },
};

/**
 * @param {Object} props
 * @param {{ code?: string, message?: string, details?: any }} props.error
 * @param {() => void} [props.onRetry]
 */
export default function ErrorPanel({ error, onRetry }) {
  const { submitPlan, isLoading } = usePlanTrip();

  const code = error?.code || 'INTERNAL_ERROR';
  const mapped = ERROR_CODE_MAP[code] || {
    title: 'Planning Request Failed',
    message: error?.message || 'Failed to calculate truck routes. Please try again.',
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      submitPlan();
    }
  };

  return (
    <div
      role="alert"
      className="rounded-2xl p-5 mt-6 border border-risk-severe/40 bg-risk-no-travel/20 space-y-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-risk-severe/20 border border-risk-severe/40 flex items-center justify-center shrink-0 text-risk-severe">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg text-white uppercase tracking-wide">
              {mapped.title}
            </h3>
            <span className="font-mono text-[10px] uppercase text-risk-severe border border-risk-severe/30 px-1.5 py-0.5 rounded bg-risk-severe/10">
              {code}
            </span>
          </div>

          <p className="font-body text-xs text-text-muted leading-relaxed">
            {mapped.message}
          </p>

          {error?.message && error.message !== mapped.message && (
            <p className="font-mono text-[11px] text-text-muted mt-1">
              Details: {error.message}
            </p>
          )}
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={handleRetry}
          disabled={isLoading}
          loading={isLoading}
        >
          Try Again
        </Button>
      </div>
    </div>
  );
}
