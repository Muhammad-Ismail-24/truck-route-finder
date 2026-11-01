import { describe, it, expect } from 'vitest';
import { validateLoadWeight, getLoadRuleHelperText } from './LoadWeightInput';
import { validateDepartureTime } from './DepartureInput';
import { dateTimeLocalToIso, getDefaultDepartureDateTimeLocal } from '../../lib/format/time';

function toLocalInputString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

describe('Trip Form Validation (Section 15.3, 17.3, D-01, D-09, D-10)', () => {
  describe('Load Weight Boundaries (D-09)', () => {
    it('rejects weights below 1 lb', () => {
      expect(validateLoadWeight(0).isValid).toBe(false);
      expect(validateLoadWeight(-50).isValid).toBe(false);
      expect(validateLoadWeight(NaN).isValid).toBe(false);
      expect(validateLoadWeight(null).isValid).toBe(false);
    });

    it('rejects weights above 80,000 lb', () => {
      expect(validateLoadWeight(80001).isValid).toBe(false);
      expect(validateLoadWeight(80001).error).toContain('cannot exceed 80,000 lb');
      expect(validateLoadWeight(100000).isValid).toBe(false);
    });

    it('accepts boundary weights exactly 1 and 80,000 lb', () => {
      expect(validateLoadWeight(1).isValid).toBe(true);
      expect(validateLoadWeight(80000).isValid).toBe(true);
    });

    it('displays dynamic load rule helper text at 30000, 30001, 40000 and 40001 lb boundaries (Section 9.3, D-09)', () => {
      // up to 30,000 lb: exactly 30,000 does NOT trigger stricter rule
      const at30k = validateLoadWeight(30000);
      expect(at30k.isValid).toBe(true);
      expect(at30k.tierMessage).toBe('Wind of 55 mph or more is No Travel.');
      expect(getLoadRuleHelperText(30000)).toBe('Wind of 55 mph or more is No Travel.');

      // above 30,000 up to 40,000 lb: 30,001 triggers medium load rule
      const over30k = validateLoadWeight(30001);
      expect(over30k.isValid).toBe(true);
      expect(over30k.tierMessage).toBe(
        'Wind 45-54 mph is No Travel for this load. 55 mph or more is No Travel.'
      );
      expect(getLoadRuleHelperText(30001)).toBe(
        'Wind 45-54 mph is No Travel for this load. 55 mph or more is No Travel.'
      );

      // exactly 40,000 lb does NOT trigger heavy load rule
      const at40k = validateLoadWeight(40000);
      expect(at40k.isValid).toBe(true);
      expect(at40k.tierMessage).toBe(
        'Wind 45-54 mph is No Travel for this load. 55 mph or more is No Travel.'
      );
      expect(getLoadRuleHelperText(40000)).toBe(
        'Wind 45-54 mph is No Travel for this load. 55 mph or more is No Travel.'
      );

      // above 40,000 lb: 40,001 triggers heavy load rule
      const over40k = validateLoadWeight(40001);
      expect(over40k.isValid).toBe(true);
      expect(over40k.tierMessage).toBe(
        'Wind 45-54 mph is No Travel; wind 35-44 mph is Severe for this load. 55 mph or more is No Travel.'
      );
      expect(getLoadRuleHelperText(40001)).toBe(
        'Wind 45-54 mph is No Travel; wind 35-44 mph is Severe for this load. 55 mph or more is No Travel.'
      );
    });
  });

  describe('Departure Time Window (Section 15.3, D-10)', () => {
    it('rejects empty or invalid departure dates', () => {
      expect(validateDepartureTime('').isValid).toBe(false);
      expect(validateDepartureTime('invalid-date').isValid).toBe(false);
    });

    it('rejects departures more than 60 minutes in the past', () => {
      const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
      const iso = toLocalInputString(twoHoursAgo);
      const res = validateDepartureTime(iso);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('more than 60 minutes in the past');
    });

    it('rejects departures more than 7 days in the future', () => {
      const eightDaysFuture = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
      const iso = toLocalInputString(eightDaysFuture);
      const res = validateDepartureTime(iso);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('more than 7 days in the future');
    });

    it('accepts valid near-term departures and marks long-range (> 5 days)', () => {
      // 2 hours in the future
      const nearFuture = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const nearIso = toLocalInputString(nearFuture);
      const nearRes = validateDepartureTime(nearIso);
      expect(nearRes.isValid).toBe(true);
      expect(nearRes.isLongRange).toBe(false);

      // 6 days in the future (long-range threshold)
      const sixDaysFuture = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
      const farIso = toLocalInputString(sixDaysFuture);
      const farRes = validateDepartureTime(farIso);
      expect(farRes.isValid).toBe(true);
      expect(farRes.isLongRange).toBe(true);
    });

    it('generates valid default departure time at next full hour', () => {
      const defaultTime = getDefaultDepartureDateTimeLocal();
      expect(defaultTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      const val = validateDepartureTime(defaultTime);
      expect(val.isValid).toBe(true);
    });

    it('converts local input to ISO string with timezone offset for API', () => {
      const defaultTime = getDefaultDepartureDateTimeLocal();
      const isoWithOffset = dateTimeLocalToIso(defaultTime);
      expect(isoWithOffset).toMatch(/[+-]\d{2}:\d{2}$/);
    });
  });
});
