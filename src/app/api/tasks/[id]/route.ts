import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { Errors } from '@/lib/http/errors';
import { taskUpdateSchema } from '@/lib/validation/schemas';
import { parseUuid } from '@/lib/http/conversation-guards';
import { deleteTask, updateTask } from '@/lib/services/tasks';

export const dynamic = 'force-dynamic';

export const PATCH = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'task id');
  const patch = taskUpdateSchema.parse(await readJson(req));
  const task = await updateTask(user.id, id, patch);
  if (!task) throw Errors.notFound('Task');
  return jsonOk({ task });
});

export const DELETE = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'task id');
  if (!(await deleteTask(user.id, id))) throw Errors.notFound('Task');
  return jsonOk({ ok: true });
});
