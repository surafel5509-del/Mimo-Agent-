import { query, queryOne } from '@/lib/database/pool';

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_approval' | 'step_limit';

export async function createRun(input: {
  userId: string;
  conversationId: string | null;
  mode: string;
  model: string;
  protocol: 'native' | 'json';
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO agent_runs (user_id, conversation_id, mode, model, protocol) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.userId, input.conversationId, input.mode, input.model, input.protocol],
  );
  return row!.id;
}

export async function updateRunProtocol(runId: string, protocol: 'native' | 'json'): Promise<void> {
  await query(`UPDATE agent_runs SET protocol = $2 WHERE id = $1`, [runId, protocol]);
}

export async function finishRun(
  runId: string,
  userId: string,
  data: {
    status: RunStatus;
    stepsUsed: number;
    toolCalls: number;
    promptTokens: number;
    completionTokens: number;
    errorCode?: string | null;
  },
): Promise<void> {
  await query(
    `UPDATE agent_runs SET status = $3, steps_used = $4, tool_calls = $5, prompt_tokens = $6, completion_tokens = $7,
            error_code = $8, finished_at = now()
      WHERE id = $1 AND user_id = $2`,
    [runId, userId, data.status, data.stepsUsed, data.toolCalls, data.promptTokens, data.completionTokens, data.errorCode ?? null],
  );
}

export async function recordStep(input: {
  runId: string;
  userId: string;
  idx: number;
  kind: 'plan' | 'model' | 'tool' | 'approval' | 'final' | 'error' | 'memory';
  name?: string | null;
  input?: unknown;
  output?: unknown;
  status?: 'ok' | 'error' | 'denied' | 'pending' | 'running';
  durationMs?: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO agent_steps (run_id, user_id, idx, kind, name, input, output, status, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.runId,
      input.userId,
      input.idx,
      input.kind,
      input.name ?? null,
      JSON.stringify(truncateJson(input.input ?? null)),
      JSON.stringify(truncateJson(input.output ?? null)),
      input.status ?? 'ok',
      input.durationMs ?? null,
    ],
  );
}

/** Keeps stored step payloads small. Model prompts never come from this data. */
export function truncateJson(value: unknown, maxChars = 4000): unknown {
  if (value === null || value === undefined) return null;
  const s = JSON.stringify(value);
  if (s.length <= maxChars) return value;
  return { truncated: true, preview: s.slice(0, maxChars) };
}

export async function listRunSteps(userId: string, runId: string) {
  return query<{
    idx: number;
    kind: string;
    name: string | null;
    status: string;
    duration_ms: number | null;
    output: unknown;
    input: unknown;
    created_at: Date;
  }>(
    `SELECT s.idx, s.kind, s.name, s.status, s.duration_ms, s.input, s.output, s.created_at
       FROM agent_steps s JOIN agent_runs r ON r.id = s.run_id
      WHERE s.run_id = $1 AND r.user_id = $2 ORDER BY s.idx ASC`,
    [runId, userId],
  );
}

export async function listRecentRuns(userId: string, limit = 20) {
  return query<{
    id: string;
    mode: string;
    model: string;
    status: string;
    steps_used: number;
    tool_calls: number;
    started_at: Date;
    finished_at: Date | null;
    conversation_id: string | null;
  }>(
    `SELECT id, mode, model, status, steps_used, tool_calls, started_at, finished_at, conversation_id
       FROM agent_runs WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [userId, limit],
  );
}
