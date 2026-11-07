import { apiRoute, clientIp, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { Errors } from '@/lib/http/errors';
import { noteUpdateSchema } from '@/lib/validation/schemas';
import { parseUuid } from '@/lib/http/conversation-guards';
import { deleteNote, updateNote } from '@/lib/services/notes';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export const PATCH = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'note id');
  const patch = noteUpdateSchema.parse(await readJson(req));
  const note = await updateNote(user.id, id, patch);
  if (!note) throw Errors.notFound('Note');
  await writeAudit({ userId: user.id, category: 'data', action: 'note.update', target: id, ip: clientIp(req) });
  return jsonOk({ note });
});

export const DELETE = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'note id');
  if (!(await deleteNote(user.id, id))) throw Errors.notFound('Note');
  await writeAudit({ userId: user.id, category: 'data', action: 'note.delete', target: id, ip: clientIp(req) });
  return jsonOk({ ok: true });
});
