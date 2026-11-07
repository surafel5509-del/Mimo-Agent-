import { webSearchConfigured } from '@/lib/tools/web-search';
import { apiRoute, jsonOk } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { TOOL_REGISTRY, resolveTool, toolJsonSchema } from '@/lib/tools/registry';
import { getToolOverrides } from '@/lib/services/admin-config';
import { getEnv } from '@/lib/config';
import { AGENT_MODES } from '@/lib/agents/modes';

export const dynamic = 'force-dynamic';

/** Tool catalogue: what exists, who can use it, and its current availability. */
export const GET = apiRoute(async (req) => {
  await requireUser(req);
  const overrides = await getToolOverrides();
  const env = getEnv();
  const tools = TOOL_REGISTRY.map((def) => {
    const r = resolveTool(def, overrides.get(def.name));
    const configured =
      def.name === 'web_search' ? webSearchConfigured()
      : def.name === 'image_analysis' ? Boolean(env.NVIDIA_VISION_MODEL)
      : true;
    return {
      name: def.name,
      title: def.title,
      description: def.description,
      permission: def.permission,
      requiresApproval: def.name === 'notes' || def.name === 'memory_save' || r.requiresApproval({}),
      timeoutMs: r.timeoutMs,
      enabled: r.enabled,
      configured,
      inputSchema: toolJsonSchema(def),
      modes: Object.values(AGENT_MODES).filter((m) => m.allowedTools.includes(def.name)).map((m) => m.id),
    };
  });
  return jsonOk({ tools });
});
