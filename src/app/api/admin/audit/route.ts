import { apiRoute, jsonOk } from '@/lib/http/respond';
import { requireAdmin } from '@/lib/auth/guards';
import { query } from '@/lib/database/pool';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['auth', 'data', 'admin', 'security', 'agent', 'error', 'system'];

export const GET = apiRoute(async (req) => {
  await requireAdmin(req);
  const sp = new URL(req.url).searchParams;
  const category = sp.get('category') ?? '';
  const limit = Math.min(Number(sp.get('limit') ?? 100) || 100, 300);
  const rows = await query<{ id: string; user_id: string | null; category: string; action: string; target: string | null; ip: string | null; metadata: unknown; created_at: Date; email: string | null }>(
    `SELECT a.id, a.user_id, a.category, a.action, a.target, a.ip, a.metadata, a.created_at, u.email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      WHERE ($1 = '' OR a.category = $1) ORDER BY a.created_at DESC LIMIT $2`,
    [CATEGORIES.includes(category) ? category : '', limit],
  );
  return jsonOk({
    entries: rows.map((r) => ({
      id: String(r.id),
      userEmail: r.email,
      category: r.category,
      action: r.action,
      target: r.target,
      ip: r.ip,
      metadata: r.metadata,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  });
});
