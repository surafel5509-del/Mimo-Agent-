import { query, queryOne } from '@/lib/database/pool';

export type ApprovalDto = {
  id: string;
  tool: string;
  summary: string;
  consequences: string;
  status: string;
  conversationId: string | null;
  createdAt: string;
  expiresAt: string;
};

export async function createApproval(input: {
  userId: string;
  runId: string | null;
  conversationId: string | null;
  tool: string;
  input: unknown;
  summary: string;
  consequences: string;
}): Promise<ApprovalDto> {
  const row = await queryOne<{ id: string; tool_name: string; summary: string; consequences: string; status: string; conversation_id: string | null; created_at: Date; expires_at: Date }>(
    `INSERT INTO tool_approvals (user_id, run_id, conversation_id, tool_name, input, summary, consequences)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, tool_name, summary, consequences, status, conversation_id, created_at, expires_at`,
    [input.userId, input.runId, input.conversationId, input.tool, JSON.stringify(input.input), input.summary.slice(0, 500), input.consequences.slice(0, 500)],
  );
  return toApprovalDto(row!);
}

function toApprovalDto(r: { id: string; tool_name: string; summary: string; consequences: string; status: string; conversation_id: string | null; created_at: Date; expires_at: Date }): ApprovalDto {
  return {
    id: r.id,
    tool: r.tool_name,
    summary: r.summary,
    consequences: r.consequences,
    status: r.status,
    conversationId: r.conversation_id,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
  };
}

export async function listPendingApprovals(userId: string): Promise<ApprovalDto[]> {
  await query(`UPDATE tool_approvals SET status = 'expired' WHERE user_id = $1 AND status = 'pending' AND expires_at < now()`, [userId]);
  const rows = await query<Parameters<typeof toApprovalDto>[0]>(
    `SELECT id, tool_name, summary, consequences, status, conversation_id, created_at, expires_at
       FROM tool_approvals WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map(toApprovalDto);
}

/**
 * Atomically moves a pending, unexpired approval to a terminal state. Returns the stored
 * invocation so it can be executed exactly once.
 */
export async function claimApproval(
  userId: string,
  id: string,
  decision: 'approve' | 'deny',
): Promise<{ tool: string; input: unknown; conversationId: string | null } | null> {
  const row = await queryOne<{ tool_name: string; input: unknown; conversation_id: string | null }>(
    `UPDATE tool_approvals SET status = $3, decided_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > now()
      RETURNING tool_name, input, conversation_id`,
    [id, userId, decision === 'approve' ? 'approved' : 'denied'],
  );
  return row ? { tool: row.tool_name, input: row.input, conversationId: row.conversation_id } : null;
}

export async function completeApproval(id: string, userId: string, status: 'completed' | 'failed', result: unknown): Promise<void> {
  await query(`UPDATE tool_approvals SET status = $3, result = $4 WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
    status,
    JSON.stringify(result ?? null),
  ]);
}
