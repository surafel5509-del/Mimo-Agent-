import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { ApiError, Errors } from '@/lib/http/errors';
import { conversationPatchSchema } from '@/lib/validation/schemas';
import { parseUuid } from '@/lib/http/conversation-guards';
import {
  deleteConversation,
  getConversation,
  listMessages,
  toConversationDto,
  updateConversation,
} from '@/lib/services/conversations';
import { writeAudit } from '@/lib/services/audit';
import { getModelOptions } from '@/lib/config';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiRoute<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  const id = parseUuid((await params).id, 'conversation id');
  const conv = await getConversation(user.id, id);
  if (!conv) throw Errors.notFound('Conversation');
  const messages = await listMessages(user.id, id);
  return jsonOk({ conversation: toConversationDto(conv), messages });
});

export const PATCH = apiRoute<{ id: string }>(async (req, ctx: Ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'conversation id');
  const patch = conversationPatchSchema.parse(await readJson(req));
  if (patch.model && !getModelOptions().includes(patch.model)) throw new ApiError(400, 'model_not_allowed', 'That model is not enabled.');
  const row = await updateConversation(user.id, id, patch);
  if (!row) throw Errors.notFound('Conversation');
  await writeAudit({ userId: user.id, category: 'data', action: 'conversation.update', target: id, metadata: { fields: Object.keys(patch) } });
  return jsonOk({ conversation: toConversationDto(row) });
});

export const DELETE = apiRoute<{ id: string }>(async (req, ctx: Ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'conversation id');
  const ok = await deleteConversation(user.id, id);
  if (!ok) throw Errors.notFound('Conversation');
  await writeAudit({ userId: user.id, category: 'data', action: 'conversation.delete', target: id });
  return jsonOk({ ok: true });
});

