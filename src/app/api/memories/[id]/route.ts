import { apiRoute, clientIp, jsonOk } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { Errors } from '@/lib/http/errors';
import { parseUuid } from '@/lib/http/conversation-guards';
import { deleteMemory } from '@/lib/services/memories';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export const DELETE = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'memory id');
  if (!(await deleteMemory(user.id, id))) throw Errors.notFound('Memory');
  await writeAudit({ userId: user.id, category: 'data', action: 'memory.delete', target: id, ip: clientIp(req) });
  return jsonOk({ ok: true });
});
