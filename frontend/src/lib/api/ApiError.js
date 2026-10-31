/**
 * Typed API Error representation matching backend error contract (Section 15.4).
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number, details?: Record<string, any> }} [options]
   */
  constructor(message, { code = 'INTERNAL_ERROR', status = 500, details = {} } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
