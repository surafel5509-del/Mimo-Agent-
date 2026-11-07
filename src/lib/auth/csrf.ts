import { CSRF_COOKIE, CSRF_HEADER, cookieString, parseCookies } from './cookies';
import { generateToken, safeEqual } from '@/lib/security/tokens';
import { getEnv } from '@/lib/config';
import { ApiError, Errors } from '@/lib/http/errors';

/**
 * CSRF defence: double-submit token plus Origin validation.
 * - The token lives in a non-HttpOnly cookie and must be echoed in the X-CSRF-Token header.
 * - If an Origin header is present it must match the request host or APP_URL.
 */
export function issueCsrfCookie(existing?: string | null): { token: string; setCookie: string } {
  const token = existing && existing.length >= 32 ? existing : generateToken();
  return {
    token,
    setCookie: cookieString(CSRF_COOKIE, token, { httpOnly: false, maxAgeSec: 60 * 60 * 24 }),
  };
}

export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('host');
  const allowed = new Set<string>();
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  try {
    allowed.add(new URL(getEnv().APP_URL).origin);
  } catch {
    /* invalid APP_URL is caught at startup */
  }
  if (!allowed.has(origin)) throw new ApiError(403, 'bad_origin', 'Cross-site request blocked.');
}

/** Validates state-changing requests. Safe methods are not checked. */
export function assertCsrf(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  assertSameOrigin(req);
  const cookies = parseCookies(req.headers.get('cookie'));
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = req.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) throw Errors.csrf();
}
