import { fetchJson } from './client';

/**
 * Sends a trip planning request to POST /api/v1/plan
 * @param {import('../types').PlanRequest} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('../types').PlanResponse>}
 */
export async function planTrip(payload, { signal } = {}) {
  return fetchJson('/api/v1/plan', {
    method: 'POST',
    body: payload,
    signal,
  });
}
