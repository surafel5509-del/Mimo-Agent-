import { apiRoute, clientIp, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { noteCreateSchema } from '@/lib/validation/schemas';
import { createNote, listNotes } from '@/lib/services/notes';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const q = new URL(req.url).searchParams.get('q') ?? undefined;
  return jsonOk({ notes: await listNotes(user.id, q?.slice(0, 200)) });
});

export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const input = noteCreateSchema.parse(await readJson(req));
  const note = await createNote(user.id, { ...input, projectId: input.projectId ?? null });
  await writeAudit({ userId: user.id, category: 'data', action: 'note.create', target: note.id, ip: clientIp(req) });
  return jsonOk({ note }, { status: 201 });
});
