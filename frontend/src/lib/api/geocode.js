import { fetchJson } from './client';

/**
 * Queries address suggestions from GET /api/v1/geocode/suggest
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('../types').GeocodeSuggestResponse>}
 */
export async function suggestPlaces(query, { signal } = {}) {
  const q = encodeURIComponent(query || '');
  return fetchJson(`/api/v1/geocode/suggest?q=${q}`, {
    method: 'GET',
    signal,
  });
}
