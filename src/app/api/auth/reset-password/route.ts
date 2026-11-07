import { resetPasswordSchema } from '@/lib/validation/schemas';
import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { assertCsrf } from '@/lib/auth/csrf';
import { ApiError } from '@/lib/http/errors';
import { consumeAuthToken } from '@/lib/services/auth-tokens';
import { hashPassword } from '@/lib/security/passwords';
import { setPasswordHash } from '@/lib/services/users';
import { revokeAllSessions } from '@/lib/auth/sessions';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async (req) => {
  assertCsrf(req);
  const input = resetPasswordSchema.parse(await readJson(req));
  const userId = await consumeAuthToken(input.token, 'reset_password');
  if (!userId) throw new ApiError(400, 'invalid_token', 'This reset link is invalid or has expired.');
  await setPasswordHash(userId, await hashPassword(input.password));
  await revokeAllSessions(userId);
  await writeAudit({ userId, category: 'security', action: 'auth.password_reset_completed' });
  return jsonOk({ ok: true });
});
