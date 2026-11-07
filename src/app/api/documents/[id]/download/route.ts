import { apiRoute } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { Errors } from '@/lib/http/errors';
import { parseUuid } from '@/lib/http/conversation-guards';
import { getDocument } from '@/lib/services/documents';
import { getObject } from '@/lib/storage/object-store';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

/** Streams the original file back to its owner only, as an attachment with safe headers. */
export const GET = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'document id');
  const doc = await getDocument(user.id, id);
  if (!doc) throw Errors.notFound('Document');
  const data = await getObject(doc.storage_key);
  await writeAudit({ userId: user.id, category: 'data', action: 'document.download', target: id });
  const asciiName = doc.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': doc.mime_type,
      'Content-Length': String(data.length),
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});
