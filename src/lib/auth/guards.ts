import { SESSION_COOKIE, parseCookies } from './cookies';
import { getSessionUser, type SessionUser } from './sessions';
import { ApiError, Errors } from '@/lib/http/errors';
import { assertCsrf } from './csrf';

/** Resolves the authenticated user from a Request (cookie header). Returns null if anonymous. */
export async function getRequestUser(req: Request): Promise<SessionUser | null> {
  const cookies = parseCookies(req.headers.get('cookie'));
  return getSessionUser(cookies[SESSION_COOKIE]);
}

/** Requires an authenticated user and validates CSRF on mutating requests. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await getRequestUser(req);
  if (!user) throw Errors.unauthorized();
  assertCsrf(req);
  return user;
}

/** Requires the admin role. Every admin route must call this. */
export async function requireAdmin(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw Errors.forbidden();
  return user;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
