import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { Errors } from '@/lib/http/errors';
import { messageEditSchema } from '@/lib/validation/schemas';
import { parseUuid } from '@/lib/http/conversation-guards';
import { getConversation, truncateFromMessage } from '@/lib/services/conversations';
import { query } from '@/lib/database/pool';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

/**
 * DELETE: removes a message and everything after it (used before "edit & resend").
 * The client then sends the edited text as a new chat turn.
 */
export const DELETE = apiRoute<{ id: string; messageId: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const p = await ctx.params;
  const conversationId = parseUuid(p.id, 'conversation id');
  const messageId = parseUuid(p.messageId, 'message id');
  if (!(await getConversation(user.id, conversationId))) throw Errors.notFound('Conversation');
  const removed = await truncateFromMessage(user.id, conversationId, messageId);
  if (removed < 0) throw Errors.notFound('Message');
  await writeAudit({ userId: user.id, category: 'data', action: 'message.truncate', target: conversationId, metadata: { removed } });
  return jsonOk({ removed });
});

/** PATCH: edit a user message's text in place (no re-run). */
export const PATCH = apiRoute<{ id: string; messageId: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const p = await ctx.params;
  const conversationId = parseUuid(p.id, 'conversation id');
  const messageId = parseUuid(p.messageId, 'message id');
  const { content } = messageEditSchema.parse(await readJson(req));
  if (!(await getConversation(user.id, conversationId))) throw Errors.notFound('Conversation');
  const rows = await query(
    `UPDATE messages SET content = $4 WHERE id = $1 AND conversation_id = $2 AND user_id = $3 AND role = 'user' RETURNING id`,
    [messageId, conversationId, user.id, content],
  );
  if (rows.length === 0) throw Errors.notFound('Message');
  return jsonOk({ ok: true });
});
