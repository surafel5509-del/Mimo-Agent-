import { NextResponse } from 'next/server';
import { CSRF_COOKIE, SESSION_COOKIE, clearCookieString, cookieString, parseCookies } from './cookies';
import { issueCsrfCookie } from './csrf';
import { getEnv } from '@/lib/config';

/** Attaches a fresh session cookie and CSRF cookie to a response. */
export function attachSessionCookies(res: NextResponse, sessionToken: string, expiresAt: Date, requestCookies: string | null) {
  const maxAgeSec = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  res.headers.append('Set-Cookie', cookieString(SESSION_COOKIE, sessionToken, { maxAgeSec, httpOnly: true }));
  const existing = parseCookies(requestCookies)[CSRF_COOKIE];
  res.headers.append('Set-Cookie', issueCsrfCookie(existing).setCookie);
  return res;
}

export function clearSessionCookies(res: NextResponse) {
  res.headers.append('Set-Cookie', clearCookieString(SESSION_COOKIE, true));
  return res;
}

export function devLinkPayload(link?: string): Record<string, string> {
  const env = getEnv();
  return link && env.NODE_ENV !== 'production' ? { devLink: link } : {};
}
