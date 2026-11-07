import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validation/schemas';
import { apiRoute, clientIp, readJson } from '@/lib/http/respond';
import { ApiError, Errors } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { assertCsrf } from '@/lib/auth/csrf';
import { verifyPassword } from '@/lib/security/passwords';
import { findUserByEmail, toPublicUser, touchLogin, normalizeEmail } from '@/lib/services/users';
import { createSession } from '@/lib/auth/sessions';
import { writeAudit } from '@/lib/services/audit';
import { getEnv } from '@/lib/config';
import { attachSessionCookies } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

// Dummy hash so unknown emails take comparable time (prevents user enumeration by timing).
const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8Qz8kQ7FqTq1dCkBnbF0z1wI7Y1Pq6';

export const POST = apiRoute(async (req) => {
  assertCsrf(req);
  const ip = clientIp(req);
  const input = loginSchema.parse(await readJson(req));
  enforceRateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
  enforceRateLimit(`login:email:${normalizeEmail(input.email)}`, 10, 15 * 60 * 1000);

  const user = await findUserByEmail(input.email);
  const valid = await verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) {
    await writeAudit({ userId: user?.id ?? null, category: 'security', action: 'auth.login_failed', ip, metadata: {} });
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
  }
  if (user.status !== 'active') throw Errors.forbidden();
  if (getEnv().EMAIL_VERIFICATION_REQUIRED && !user.email_verified_at) {
    throw new ApiError(403, 'email_not_verified', 'Please verify your email address before signing in.');
  }

  await touchLogin(user.id);
  const session = await createSession(user.id, { userAgent: req.headers.get('user-agent'), ip });
  await writeAudit({ userId: user.id, category: 'auth', action: 'auth.login', ip, metadata: {} });
  const res = NextResponse.json({ user: toPublicUser(user) }, { headers: { 'Cache-Control': 'no-store' } });
  return attachSessionCookies(res, session.token, session.expiresAt, req.headers.get('cookie'));
});
