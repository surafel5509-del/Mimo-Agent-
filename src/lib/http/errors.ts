export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const Errors = {
  unauthorized: () => new ApiError(401, 'unauthorized', 'You need to sign in to continue.'),
  forbidden: () => new ApiError(403, 'forbidden', 'You do not have permission to perform this action.'),
  notFound: (what = 'Resource') => new ApiError(404, 'not_found', `${what} was not found.`),
  conflict: (msg: string) => new ApiError(409, 'conflict', msg),
  badRequest: (msg: string, details?: unknown) => new ApiError(400, 'bad_request', msg, details),
  csrf: () => new ApiError(403, 'csrf_failed', 'Your session security token is missing or invalid. Refresh the page and try again.'),
  rateLimited: (retryAfterSec: number) =>
    new ApiError(429, 'rate_limited', `Too many requests. Please wait ${retryAfterSec} seconds and try again.`),
  payloadTooLarge: (msg: string) => new ApiError(413, 'payload_too_large', msg),
  unsupportedMedia: (msg: string) => new ApiError(415, 'unsupported_media_type', msg),
  budgetExceeded: () =>
    new ApiError(429, 'token_budget_exceeded', 'Your daily AI usage budget is used up. It resets at midnight UTC.'),
};
