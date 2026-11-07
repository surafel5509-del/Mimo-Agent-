import { apiRoute, clientIp, jsonOk } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { Errors } from '@/lib/http/errors';
import { parseUuid } from '@/lib/http/conversation-guards';
import { deleteDocument, getDocument, toDocumentDto, getDocumentChunks } from '@/lib/services/documents';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export const GET = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'document id');
  const doc = await getDocument(user.id, id);
  if (!doc) throw Errors.notFound('Document');
  const preview = doc.kind === 'image' ? [] : await getDocumentChunks(user.id, id, { limit: 2 });
  return jsonOk({ document: toDocumentDto(doc), preview: preview.map((c) => c.content.slice(0, 800)) });
});

export const DELETE = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'document id');
  const ok = await deleteDocument(user.id, id);
  if (!ok) throw Errors.notFound('Document');
  await writeAudit({ userId: user.id, category: 'data', action: 'document.delete', target: id, ip: clientIp(req) });
  return jsonOk({ ok: true });
});
