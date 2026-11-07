import { forgotPasswordSchema } from '@/lib/validation/schemas';
import { apiRoute, clientIp, jsonOk, readJson } from '@/lib/http/respond';
import { assertCsrf } from '@/lib/auth/csrf';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { startPasswordReset } from '@/lib/services/auth-flows';
import { devLinkPayload } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async (req) => {
  assertCsrf(req);
  const ip = clientIp(req);
  const { email } = forgotPasswordSchema.parse(await readJson(req));
  enforceRateLimit(`reset:ip:${ip}`, 10, 60 * 60 * 1000);
  enforceRateLimit(`reset:email:${email}`, 5, 60 * 60 * 1000);
  const result = await startPasswordReset(email, ip);
  // Same response whether or not the account exists.
  return jsonOk({
    ok: true,
    message: 'If an account exists for that email, a reset link has been sent.',
    ...devLinkPayload(result.devLink),
  });
});
