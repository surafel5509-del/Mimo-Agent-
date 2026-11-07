import { NextResponse } from 'next/server';
import { registerSchema } from '@/lib/validation/schemas';
import { apiRoute, clientIp, readJson } from '@/lib/http/respond';
import { ApiError } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { assertCsrf } from '@/lib/auth/csrf';
import { hashPassword } from '@/lib/security/passwords';
import { createUser, findUserByEmail, toPublicUser } from '@/lib/services/users';
import { createSession } from '@/lib/auth/sessions';
import { writeAudit } from '@/lib/services/audit';
import { startEmailVerification } from '@/lib/services/auth-flows';
import { getEnv } from '@/lib/config';
import { attachSessionCookies, devLinkPayload } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async (req) => {
  assertCsrf(req);
  const ip = clientIp(req);
  enforceRateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
  const input = registerSchema.parse(await readJson(req));

  if (await findUserByEmail(input.email)) {
    // Generic response to avoid confirming which emails are registered.
    await writeAudit({ category: 'auth', action: 'auth.register_duplicate', ip, metadata: {} });
    throw new ApiError(409, 'registration_failed', 'We could not create an account with those details.');
  }

  const verificationRequired = getEnv().EMAIL_VERIFICATION_REQUIRED;
  const user = await createUser({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    emailVerified: !verificationRequired,
  });
  await writeAudit({ userId: user.id, category: 'auth', action: 'auth.register', ip, metadata: { role: user.role } });

  let devLink: string | undefined;
  if (verificationRequired) {
    devLink = (await startEmailVerification(user, ip)).devLink;
    return NextResponse.json(
      { user: toPublicUser(user), verificationRequired: true, ...devLinkPayload(devLink) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const session = await createSession(user.id, { userAgent: req.headers.get('user-agent'), ip });
  const res = NextResponse.json(
    { user: toPublicUser(user), verificationRequired: false },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
  return attachSessionCookies(res, session.token, session.expiresAt, req.headers.get('cookie'));
});
