import { apiRoute, jsonOk } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { listPendingApprovals } from '@/lib/services/approvals';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return jsonOk({ approvals: await listPendingApprovals(user.id) });
});
