'use client';

/**
 * @file TripForm.jsx
 * Primary user input form for route planning.
 * Coordinates origin, destination, departure time, cargo weight, and spacing.
 *
 * References:
 * ARCHITECTURE.md Section 17.3, 17.7, 25.4, 25.5.
 */

import { useMemo } from 'react';
import { useTrip } from '../../state/TripProvider';
import { usePlanTrip } from '../../hooks/usePlanTrip';
import LocationInput from './LocationInput';
import DepartureInput, { validateDepartureTime } from './DepartureInput';
import LoadWeightInput, { validateLoadWeight } from './LoadWeightInput';
import IntervalSelect from './IntervalSelect';
import Button from '../ui/Button';

export default function TripForm() {
  const { state, dispatch } = useTrip();
  const { form } = state;
  const { submitPlan, loading, error: planError } = usePlanTrip();

  const handleFieldChange = (field, value) => {
    dispatch({
      type: 'FORM_CHANGED',
      payload: { [field]: value },
    });
  };

  // Form validity check
  const isFormValid = useMemo(() => {
    if (!form.origin || !form.destination) return false;
    if (typeof form.origin.lat !== 'number' || typeof form.destination.lat !== 'number') {
      return false;
    }

    // Origin cannot match destination (< 1 mi proximity check)
    if (
      Math.abs(form.origin.lat - form.destination.lat) < 0.001 &&
      Math.abs(form.origin.lng - form.destination.lng) < 0.001
    ) {
      return false;
    }

    const weightVal = validateLoadWeight(form.load_weight_lb);
    if (!weightVal.isValid) return false;

    const departureVal = validateDepartureTime(form.departure_local);
    if (!departureVal.isValid) return false;

    return true;
  }, [form]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isFormValid || loading) return;
    submitPlan();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Origin Autocomplete */}
      <LocationInput
        id="origin-input"
        label="Origin"
        value={form.origin}
        onChange={(val) => handleFieldChange('origin', val)}
        placeholder="Enter US starting city or depot"
      />

      {/* Destination Autocomplete */}
      <LocationInput
        id="destination-input"
        label="Destination"
        value={form.destination}
        onChange={(val) => handleFieldChange('destination', val)}
        placeholder="Enter US destination address or hub"
        error={
          form.origin &&
          form.destination &&
          Math.abs(form.origin.lat - form.destination.lat) < 0.001 &&
          Math.abs(form.origin.lng - form.destination.lng) < 0.001
            ? 'Destination must differ from origin'
            : undefined
        }
      />

      {/* Departure Time */}
      <DepartureInput
        id="departure-input"
        value={form.departure_local}
        onChange={(val) => handleFieldChange('departure_local', val)}
      />

      {/* Load Weight */}
      <LoadWeightInput
        id="load-weight-input"
        value={form.load_weight_lb}
        onChange={(val) => handleFieldChange('load_weight_lb', val)}
      />

      {/* Checkpoint Spacing Interval */}
      <IntervalSelect
        value={form.checkpoint_interval_miles}
        onChange={(val) => handleFieldChange('checkpoint_interval_miles', val)}
      />

      {/* Top-level plan submission error alert */}
      {planError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs font-body flex items-start gap-2.5"
        >
          <svg
            className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1">
            <span className="font-semibold block">{planError.code || 'Plan Error'}</span>
            <span>{planError.message}</span>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={loading}
          loadingText="Planning…"
          disabled={!isFormValid}
          className="w-full text-base py-3.5 tracking-wide"
        >
          Find safest route
        </Button>
      </div>
    </form>
  );
}
