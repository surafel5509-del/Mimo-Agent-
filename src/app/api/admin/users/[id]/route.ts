import { apiRoute, clientIp, jsonOk, readJson } from '@/lib/http/respond';
import { requireAdmin } from '@/lib/auth/guards';
import { adminUserPatchSchema } from '@/lib/validation/schemas';
import { parseUuid } from '@/lib/http/conversation-guards';
import { ApiError, Errors } from '@/lib/http/errors';
import { query, queryOne } from '@/lib/database/pool';
import { revokeAllSessions } from '@/lib/auth/sessions';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

/** Change a user's role or disable an account. Admins cannot demote or disable themselves. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const id = parseUuid((await ctx.params).id, 'user id');
  const patch = adminUserPatchSchema.parse(await readJson(req));
  if (id === admin.id && (patch.role === 'user' || patch.status === 'disabled')) {
    throw new ApiError(400, 'self_lockout', 'You cannot remove your own admin role or disable your own account.');
  }
  const current = await queryOne<{ role: string; status: string }>(`SELECT role, status FROM users WHERE id = $1`, [id]);
  if (!current) throw Errors.notFound('User');
  const row = await queryOne<{ id: string; role: string; status: string }>(
    `UPDATE users SET role = COALESCE($2, role), status = COALESCE($3, status), updated_at = now() WHERE id = $1 RETURNING id, role, status`,
    [id, patch.role ?? null, patch.status ?? null],
  );
  if (patch.status === 'disabled') await revokeAllSessions(id);
  await writeAudit({
    userId: admin.id,
    category: 'admin',
    action: 'admin.user_update',
    target: id,
    ip: clientIp(req),
    metadata: { before: current, after: row, fields: Object.keys(patch) },
  });
  return jsonOk({ user: row });
});
