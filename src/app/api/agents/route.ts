import { apiRoute, jsonOk } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { AGENT_MODES } from '@/lib/agents/modes';
import { getAgentOverrides } from '@/lib/services/admin-config';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  await requireUser(req);
  const overrides = await getAgentOverrides();
  const agents = Object.values(AGENT_MODES).map((m) => {
    const o = overrides.get(m.id);
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      enabled: o?.enabled ?? true,
      allowedTools: o?.allowedTools ?? m.allowedTools,
      alwaysPlan: m.alwaysPlan,
    };
  });
  return jsonOk({ agents });
});
