import { ApiError } from './ApiError';

/**
 * Common JSON fetcher supporting same-origin rewrite and typed error extraction.
 * Base URL defaults to process.env.NEXT_PUBLIC_API_BASE_URL ?? '' (Section 17.6).
 *
 * @param {string} path
 * @param {RequestInit & { body?: any }} [options]
 * @returns {Promise<any>}
 */
export async function fetchJson(path, { method = 'GET', body, signal, headers = {} } = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  const url = `${baseUrl}${path}`;

  const requestHeaders = new Headers(headers);
  let requestBody = body;

  if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(err.message || 'Network request failed', {
      code: 'NETWORK_ERROR',
      status: 0,
      details: { originalError: err },
    });
  }

  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (payload?.error) {
      throw new ApiError(payload.error.message || `HTTP ${response.status}`, {
        code: payload.error.code || 'HTTP_ERROR',
        status: response.status,
        details: payload.error.details || {},
      });
    }

    throw new ApiError(response.statusText || `HTTP ${response.status}`, {
      code: 'HTTP_ERROR',
      status: response.status,
    });
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}
