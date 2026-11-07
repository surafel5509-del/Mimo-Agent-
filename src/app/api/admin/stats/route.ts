import { apiRoute, jsonOk } from '@/lib/http/respond';
import { requireAdmin } from '@/lib/auth/guards';
import { query, queryOne } from '@/lib/database/pool';

export const dynamic = 'force-dynamic';

/** Aggregate usage. No message content or personal data is returned. */
export const GET = apiRoute(async (req) => {
  await requireAdmin(req);
  const totals = await queryOne<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM users)::text AS users,
       (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::text AS new_users_7d,
       (SELECT count(*) FROM conversations)::text AS conversations,
       (SELECT count(*) FROM messages)::text AS messages,
       (SELECT count(*) FROM documents)::text AS documents,
       (SELECT count(*) FROM agent_runs)::text AS runs,
       (SELECT count(*) FROM agent_runs WHERE status = 'failed')::text AS failed_runs,
       (SELECT count(*) FROM tool_approvals WHERE status = 'pending')::text AS pending_approvals,
       (SELECT COALESCE(sum(prompt_tokens),0) FROM usage_records)::text AS prompt_tokens,
       (SELECT COALESCE(sum(completion_tokens),0) FROM usage_records)::text AS completion_tokens,
       (SELECT COALESCE(sum(prompt_tokens + completion_tokens),0) FROM usage_records WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC'))::text AS tokens_today`,
  );
  const byDay = await query<{ day: string; tokens: string; calls: string }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            COALESCE(sum(prompt_tokens + completion_tokens),0)::text AS tokens, count(*)::text AS calls
       FROM usage_records WHERE created_at > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1`,
  );
  const byModel = await query<{ model: string; tokens: string; calls: string; failures: string }>(
    `SELECT model, COALESCE(sum(prompt_tokens + completion_tokens),0)::text AS tokens, count(*)::text AS calls,
            count(*) FILTER (WHERE NOT ok)::text AS failures
       FROM usage_records GROUP BY model ORDER BY count(*) DESC LIMIT 20`,
  );
  const errors = await query<{ action: string; count: string; last_at: Date }>(
    `SELECT action, count(*)::text AS count, max(created_at) AS last_at FROM audit_logs
      WHERE category = 'error' AND created_at > now() - interval '7 days' GROUP BY action ORDER BY count(*) DESC LIMIT 20`,
  );
  return jsonOk({
    totals: Object.fromEntries(Object.entries(totals ?? {}).map(([k, v]) => [k, Number(v)])),
    byDay: byDay.map((r) => ({ day: r.day, tokens: Number(r.tokens), calls: Number(r.calls) })),
    byModel: byModel.map((r) => ({ model: r.model, tokens: Number(r.tokens), calls: Number(r.calls), failures: Number(r.failures) })),
    errors: errors.map((r) => ({ action: r.action, count: Number(r.count), lastAt: new Date(r.last_at).toISOString() })),
  });
});
