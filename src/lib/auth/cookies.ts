import { getEnv } from '@/lib/config';

export const SESSION_COOKIE = 'mimo_session';
export const CSRF_COOKIE = 'mimo_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function isSecureCookie(): boolean {
  const env = getEnv();
  return env.AUTH_COOKIE_SECURE || env.NODE_ENV === 'production';
}

export function cookieString(
  name: string,
  value: string,
  opts: { maxAgeSec?: number; httpOnly?: boolean } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (isSecureCookie()) parts.push('Secure');
  if (opts.maxAgeSec !== undefined) parts.push(`Max-Age=${opts.maxAgeSec}`);
  return parts.join('; ');
}

export function clearCookieString(name: string, httpOnly = true): string {
  return cookieString(name, '', { maxAgeSec: 0, httpOnly });
}
