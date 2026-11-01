'use client';

/**
 * @file useIsMounted.js
 * Custom hook returning whether the component has mounted on the client.
 *
 * Uses useSyncExternalStore for hydration-safe detection of client mounting.
 * Ensures browser-dependent values (timezone, locale, matchMedia)
 * render a stable placeholder during SSR and initial client hydration,
 * preventing React hydration mismatch error #418 (Section 17).
 *
 * References:
 * ARCHITECTURE.md Section 17, Decision D-40.
 */

import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Returns false on the server and initial client render, and true after mounting.
 * @returns {boolean}
 */
export function useIsMounted() {
  return useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot);
}

export default useIsMounted;
