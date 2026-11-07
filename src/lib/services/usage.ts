import { query, queryOne } from '@/lib/database/pool';
import { getEnv } from '@/lib/config';

export async function recordUsage(entry: {
  userId: string | null;
  runId: string | null;
  model: string;
  kind: 'chat' | 'vision' | 'embedding' | 'search' | 'other';
  promptTokens: number;
  completionTokens: number;
  latencyMs?: number;
  ok?: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO usage_records (user_id, run_id, model, kind, prompt_tokens, completion_tokens, latency_ms, ok)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.userId,
      entry.runId,
      entry.model.slice(0, 120),
      entry.kind,
      Math.max(0, Math.round(entry.promptTokens)),
      Math.max(0, Math.round(entry.completionTokens)),
      entry.latencyMs ?? null,
      entry.ok ?? true,
    ],
  );
}

/** Tokens used by a user today (UTC day). Enforces AGENT_DAILY_TOKEN_BUDGET. */
export async function todayTokenUsage(userId: string): Promise<number> {
  const row = await queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0)::text AS total
       FROM usage_records WHERE user_id = $1 AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
    [userId],
  );
  return Number(row?.total ?? 0);
}

export async function assertWithinBudget(userId: string): Promise<void> {
  const used = await todayTokenUsage(userId);
  if (used >= getEnv().AGENT_DAILY_TOKEN_BUDGET) {
    const { ApiError } = await import('@/lib/http/errors');
    throw new ApiError(429, 'token_budget_exceeded', 'Your daily AI usage budget is used up. It resets at midnight UTC.');
  }
}
