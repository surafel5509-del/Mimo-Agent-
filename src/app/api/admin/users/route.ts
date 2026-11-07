import { apiRoute, jsonOk } from '@/lib/http/respond';
import { requireAdmin } from '@/lib/auth/guards';
import { query } from '@/lib/database/pool';

export const dynamic = 'force-dynamic';

/** User management list. Never returns password hashes or session tokens. */
export const GET = apiRoute(async (req) => {
  await requireAdmin(req);
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 100) ?? '';
  const rows = await query<{ id: string; email: string; role: string; status: string; email_verified_at: Date | null; created_at: Date; last_login_at: Date | null; conversations: string; documents: string; tokens: string }>(
    `SELECT u.id, u.email, u.role, u.status, u.email_verified_at, u.created_at, u.last_login_at,
            (SELECT count(*) FROM conversations c WHERE c.user_id = u.id)::text AS conversations,
            (SELECT count(*) FROM documents d WHERE d.user_id = u.id)::text AS documents,
            (SELECT COALESCE(sum(prompt_tokens + completion_tokens),0) FROM usage_records r WHERE r.user_id = u.id)::text AS tokens
       FROM users u
      WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%')
      ORDER BY u.created_at DESC LIMIT 200`,
    [q.replace(/[%_\\]/g, '')],
  );
  return jsonOk({
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      status: r.status,
      emailVerified: Boolean(r.email_verified_at),
      createdAt: new Date(r.created_at).toISOString(),
      lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
      conversations: Number(r.conversations),
      documents: Number(r.documents),
      tokens: Number(r.tokens),
    })),
  });
});
