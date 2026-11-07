import { query, queryOne, withTransaction } from '@/lib/database/pool';
import type { AgentModeId } from '@/lib/agents/modes';

export type ConversationRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  mode: string;
  model: string | null;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  attachments: unknown;
  metadata: unknown;
  run_id: string | null;
  created_at: Date;
};

export type ConversationDto = {
  id: string;
  title: string;
  mode: string;
  model: string | null;
  projectId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MessageDto = {
  id: string;
  role: MessageRow['role'];
  content: string;
  attachments: unknown[];
  metadata: Record<string, unknown>;
  runId: string | null;
  createdAt: string;
  feedback?: -1 | 1 | null;
};

export const toConversationDto = (c: ConversationRow): ConversationDto => ({
  id: c.id,
  title: c.title,
  mode: c.mode,
  model: c.model,
  projectId: c.project_id,
  archived: c.archived,
  createdAt: new Date(c.created_at).toISOString(),
  updatedAt: new Date(c.updated_at).toISOString(),
});

export async function listConversations(userId: string, opts: { q?: string; limit?: number } = {}): Promise<ConversationDto[]> {
  const limit = Math.min(opts.limit ?? 100, 200);
  const q = opts.q?.trim();
  const rows = q
    ? await query<ConversationRow>(
        `SELECT DISTINCT c.* FROM conversations c
          LEFT JOIN messages m ON m.conversation_id = c.id AND m.user_id = c.user_id
         WHERE c.user_id = $1 AND (c.title ILIKE $2 ESCAPE '\\' OR m.content ILIKE $2 ESCAPE '\\')
         ORDER BY c.updated_at DESC LIMIT $3`,
        [userId, `%${escapeLike(q)}%`, limit],
      )
    : await query<ConversationRow>(
        `SELECT * FROM conversations WHERE user_id = $1 AND archived = false ORDER BY updated_at DESC LIMIT $2`,
        [userId, limit],
      );
  return rows.map(toConversationDto);
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function getConversation(userId: string, id: string): Promise<ConversationRow | null> {
  return queryOne<ConversationRow>(`SELECT * FROM conversations WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function createConversation(
  userId: string,
  input: { mode?: AgentModeId; model?: string | null; projectId?: string | null; title?: string },
): Promise<ConversationRow> {
  if (input.projectId) {
    const owned = await queryOne(`SELECT 1 FROM projects WHERE id = $1 AND user_id = $2`, [input.projectId, userId]);
    if (!owned) throw new Error('PROJECT_NOT_OWNED');
  }
  const row = await queryOne<ConversationRow>(
    `INSERT INTO conversations (user_id, mode, model, project_id, title)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, input.mode ?? 'general', input.model ?? null, input.projectId ?? null, input.title ?? 'New chat'],
  );
  return row!;
}

export async function updateConversation(
  userId: string,
  id: string,
  patch: { title?: string; mode?: string; model?: string | null; projectId?: string | null; archived?: boolean },
): Promise<ConversationRow | null> {
  return queryOne<ConversationRow>(
    `UPDATE conversations SET
       title = COALESCE($3, title),
       mode = COALESCE($4, mode),
       model = CASE WHEN $5::boolean THEN $6 ELSE model END,
       project_id = CASE WHEN $7::boolean THEN $8::uuid ELSE project_id END,
       archived = COALESCE($9, archived),
       updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [
      id,
      userId,
      patch.title ?? null,
      patch.mode ?? null,
      patch.model !== undefined,
      patch.model ?? null,
      patch.projectId !== undefined,
      patch.projectId ?? null,
      patch.archived ?? null,
    ],
  );
}

/** Deletes a conversation and its messages (cascade). Returns false if not owned. */
export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  return rows.length > 0;
}

export async function listMessages(userId: string, conversationId: string): Promise<MessageDto[]> {
  const rows = await query<MessageRow & { feedback: number | null }>(
    `SELECT m.*, f.rating AS feedback
       FROM messages m
       LEFT JOIN message_feedback f ON f.message_id = m.id AND f.user_id = $1
      WHERE m.conversation_id = $2 AND m.user_id = $1
      ORDER BY m.created_at ASC, m.id ASC`,
    [userId, conversationId],
  );
  return rows.map(toMessageDto);
}

export function toMessageDto(m: MessageRow & { feedback?: number | null }): MessageDto {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    attachments: Array.isArray(m.attachments) ? (m.attachments as unknown[]) : [],
    metadata: (m.metadata && typeof m.metadata === 'object' ? m.metadata : {}) as Record<string, unknown>,
    runId: m.run_id,
    createdAt: new Date(m.created_at).toISOString(),
    feedback: (m.feedback ?? null) as -1 | 1 | null,
  };
}

export async function insertMessage(input: {
  userId: string;
  conversationId: string;
  role: MessageRow['role'];
  content: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
  runId?: string | null;
}): Promise<MessageDto> {
  const row = await queryOne<MessageRow>(
    `INSERT INTO messages (user_id, conversation_id, role, content, attachments, metadata, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      input.userId,
      input.conversationId,
      input.role,
      input.content,
      input.attachments ?? [],
      input.metadata ?? {},
      input.runId ?? null,
    ],
  );
  await query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [input.conversationId]);
  return toMessageDto(row!);
}

/** Deletes a message and everything after it in the same conversation (used by edit & resend). */
export async function truncateFromMessage(userId: string, conversationId: string, messageId: string): Promise<number> {
  return withTransaction(async (client) => {
    const target = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM messages WHERE id = $1 AND conversation_id = $2 AND user_id = $3`,
      [messageId, conversationId, userId],
    );
    if (target.rowCount === 0) return -1;
    const res = await client.query(
      `DELETE FROM messages WHERE conversation_id = $1 AND user_id = $2
         AND (created_at > $3 OR (created_at = $3 AND id >= $4))`,
      [conversationId, userId, target.rows[0].created_at, messageId],
    );
    return res.rowCount ?? 0;
  });
}

export async function getMessage(userId: string, messageId: string): Promise<MessageRow | null> {
  return queryOne<MessageRow>(`SELECT * FROM messages WHERE id = $1 AND user_id = $2`, [messageId, userId]);
}

export async function upsertFeedback(userId: string, messageId: string, rating: 1 | -1, comment: string): Promise<void> {
  await query(
    `INSERT INTO message_feedback (message_id, user_id, rating, comment)
     SELECT m.id, $2, $3, $4 FROM messages m WHERE m.id = $1 AND m.user_id = $2
     ON CONFLICT (message_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
    [messageId, userId, rating, comment],
  );
}
