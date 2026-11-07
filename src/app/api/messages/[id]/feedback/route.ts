import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { Errors } from '@/lib/http/errors';
import { feedbackSchema } from '@/lib/validation/schemas';
import { parseUuid } from '@/lib/http/conversation-guards';
import { getMessage, upsertFeedback } from '@/lib/services/conversations';
import { query } from '@/lib/database/pool';

export const dynamic = 'force-dynamic';

export const PUT = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'message id');
  const input = feedbackSchema.parse(await readJson(req));
  if (!(await getMessage(user.id, id))) throw Errors.notFound('Message');
  await upsertFeedback(user.id, id, input.rating, input.comment ?? '');
  return jsonOk({ ok: true });
});

export const DELETE = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'message id');
  await query(`DELETE FROM message_feedback WHERE message_id = $1 AND user_id = $2`, [id, user.id]);
  return jsonOk({ ok: true });
});
