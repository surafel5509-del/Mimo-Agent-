import { tokenSchema } from '@/lib/validation/schemas';
import { apiRoute, readJson } from '@/lib/http/respond';
import { assertCsrf } from '@/lib/auth/csrf';
import { consumeAuthToken } from '@/lib/services/auth-tokens';
import { markEmailVerified } from '@/lib/services/users';
import { writeAudit } from '@/lib/services/audit';
import { jsonOk } from '@/lib/http/respond';
import { ApiError } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async (req) => {
  assertCsrf(req);
  const { token } = tokenSchema.parse(await readJson(req));
  const userId = await consumeAuthToken(token, 'verify_email');
  if (!userId) throw new ApiError(400, 'invalid_token', 'This verification link is invalid or has expired.');
  await markEmailVerified(userId);
  await writeAudit({ userId, category: 'auth', action: 'auth.email_verified' });
  return jsonOk({ ok: true });
});
