import { NextResponse } from 'next/server';
import { apiRoute, clientIp, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { accountDeleteSchema } from '@/lib/validation/schemas';
import { ApiError } from '@/lib/http/errors';
import { verifyPassword } from '@/lib/security/passwords';
import { findUserById } from '@/lib/services/users';
import { query } from '@/lib/database/pool';
import { writeAudit } from '@/lib/services/audit';
import { getObject, deleteObject } from '@/lib/storage/object-store';
import { clearSessionCookies } from '@/lib/auth/http';

export const dynamic = 'force-dynamic';

/**
 * Permanently deletes the account and all owned data (cascade). Requires the password and the
 * literal confirmation "DELETE". Stored files are removed from object storage.
 */
export const DELETE = apiRoute(async (req) => {
  const user = await requireUser(req);
  const input = accountDeleteSchema.parse(await readJson(req));
  const row = await findUserById(user.id);
  if (!row || !(await verifyPassword(input.password, row.password_hash))) {
    throw new ApiError(400, 'invalid_password', 'Your password is incorrect.');
  }
  const files = await query<{ storage_key: string }>(`SELECT storage_key FROM documents WHERE user_id = $1`, [user.id]);
  await writeAudit({ userId: user.id, category: 'security', action: 'account.deleted', ip: clientIp(req) });
  await query(`DELETE FROM users WHERE id = $1`, [user.id]);
  for (const f of files) await deleteObject(f.storage_key).catch(() => undefined);
  return clearSessionCookies(NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }));
});
