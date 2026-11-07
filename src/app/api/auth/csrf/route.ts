import { NextResponse } from 'next/server';
import { CSRF_COOKIE, parseCookies } from '@/lib/auth/cookies';
import { issueCsrfCookie } from '@/lib/auth/csrf';
import { apiRoute } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Issues the CSRF token. Clients echo it in the X-CSRF-Token header on mutating requests. */
export const GET = apiRoute(async (req) => {
  const { token, setCookie } = issueCsrfCookie(parseCookies(req.headers.get('cookie'))[CSRF_COOKIE]);
  const res = NextResponse.json({ csrfToken: token }, { headers: { 'Cache-Control': 'no-store' } });
  res.headers.append('Set-Cookie', setCookie);
  return res;
});
