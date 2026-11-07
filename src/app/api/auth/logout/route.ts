import { NextResponse } from 'next/server';
import { SESSION_COOKIE, parseCookies } from '@/lib/auth/cookies';
import { assertCsrf } from '@/lib/auth/csrf';
import { revokeSession, getSessionUser } from '@/lib/auth/sessions';
import { apiRoute, clientIp } from '@/lib/http/respond';
import { writeAudit } from '@/lib/services/audit';
import { clearSessionCookies } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async (req) => {
  assertCsrf(req);
  const token = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
  const user = await getSessionUser(token);
  if (token) await revokeSession(token);
  if (user) await writeAudit({ userId: user.id, category: 'auth', action: 'auth.logout', ip: clientIp(req) });
  return clearSessionCookies(NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }));
});
