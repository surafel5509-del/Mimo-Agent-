import { NextResponse } from 'next/server';
import { apiRoute, clientIp, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { passwordChangeSchema } from '@/lib/validation/schemas';
import { ApiError } from '@/lib/http/errors';
import { hashPassword, verifyPassword } from '@/lib/security/passwords';
import { findUserById, setPasswordHash } from '@/lib/services/users';
import { revokeAllSessions } from '@/lib/auth/sessions';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const input = passwordChangeSchema.parse(await readJson(req));
  const row = await findUserById(user.id);
  if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
    await writeAudit({ userId: user.id, category: 'security', action: 'auth.password_change_failed', ip: clientIp(req) });
    throw new ApiError(400, 'invalid_password', 'Your current password is incorrect.');
  }
  await setPasswordHash(user.id, await hashPassword(input.newPassword));
  // Sign out every other session; keep this one.
  await revokeAllSessions(user.id, user.sessionId);
  await writeAudit({ userId: user.id, category: 'security', action: 'auth.password_changed', ip: clientIp(req) });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
});
