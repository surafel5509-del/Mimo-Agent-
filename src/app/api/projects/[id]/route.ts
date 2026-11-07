import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { Errors } from '@/lib/http/errors';
import { projectSchema } from '@/lib/validation/schemas';
import { parseUuid } from '@/lib/http/conversation-guards';
import { deleteProject, updateProject } from '@/lib/services/projects';

export const dynamic = 'force-dynamic';

export const PATCH = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'project id');
  const patch = projectSchema.partial().parse(await readJson(req));
  if (!(await updateProject(user.id, id, patch))) throw Errors.notFound('Project');
  return jsonOk({ ok: true });
});

export const DELETE = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'project id');
  if (!(await deleteProject(user.id, id))) throw Errors.notFound('Project');
  return jsonOk({ ok: true });
});
