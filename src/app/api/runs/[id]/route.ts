import { apiRoute, jsonOk } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { parseUuid } from '@/lib/http/conversation-guards';
import { listRecentRuns, listRunSteps } from '@/lib/services/runs';
import { Errors } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

/** Agent activity for one run (plan, tool history, status). Only the owner can read it. */
export const GET = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'run id');
  const steps = await listRunSteps(user.id, id);
  if (steps.length === 0) {
    const recent = await listRecentRuns(user.id, 1);
    if (!recent.some((r) => r.id === id)) throw Errors.notFound('Run');
  }
  return jsonOk({ steps });
});
