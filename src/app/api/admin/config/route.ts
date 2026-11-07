import { apiRoute, clientIp, jsonOk, readJson } from '@/lib/http/respond';
import { requireAdmin } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/services/audit';
import { getAgentOverrides, getToolOverrides, updateAgentOverride, updateToolOverride } from '@/lib/services/admin-config';
import { AGENT_MODES } from '@/lib/agents/modes';
import { TOOL_REGISTRY, toolJsonSchema } from '@/lib/tools/registry';
import { agentConfigSchema, toolConfigSchema } from '@/lib/validation/schemas';
import { ApiError } from '@/lib/http/errors';
import { z } from 'zod';
import { getModelOptions } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  await requireAdmin(req);
  const agentOv = await getAgentOverrides();
  const toolOv = await getToolOverrides();
  return jsonOk({
    models: getModelOptions(),
    agents: Object.values(AGENT_MODES).map((m) => {
      const o = agentOv.get(m.id);
      return {
        id: m.id,
        name: m.name,
        enabled: o?.enabled ?? true,
        allowedTools: o?.allowedTools ?? m.allowedTools,
        defaultAllowedTools: m.allowedTools,
        temperature: o?.temperature ?? m.temperature,
        systemPromptOverride: o?.systemPromptOverride ?? null,
      };
    }),
    tools: TOOL_REGISTRY.map((t) => ({
      name: t.name,
      title: t.title,
      permission: t.permission,
      defaultTimeoutMs: t.timeoutMs,
      enabled: toolOv.get(t.name)?.enabled ?? true,
      requiresApproval: toolOv.get(t.name)?.requiresApproval ?? null,
      timeoutMs: toolOv.get(t.name)?.timeoutMs ?? null,
      schema: toolJsonSchema(t),
    })),
  });
});

const patchSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('agent'), key: z.string().min(1).max(40), patch: agentConfigSchema }),
  z.object({ target: z.literal('tool'), key: z.string().min(1).max(60), patch: toolConfigSchema }),
]);

export const PATCH = apiRoute(async (req) => {
  const admin = await requireAdmin(req);
  const input = patchSchema.parse(await readJson(req));
  if (input.target === 'agent') {
    if (!(input.key in AGENT_MODES)) throw new ApiError(404, 'not_found', 'Unknown agent.');
    if (input.patch.allowedTools) {
      const known = new Set(TOOL_REGISTRY.map((t) => t.name));
      const bad = input.patch.allowedTools.filter((t) => !known.has(t));
      if (bad.length) throw new ApiError(400, 'unknown_tools', `Unknown tools: ${bad.join(', ')}`);
    }
    await updateAgentOverride(input.key, {
      enabled: input.patch.enabled,
      allowedTools: input.patch.allowedTools,
      temperature: input.patch.temperature,
      systemPromptOverride: input.patch.systemPromptOverride,
    });
  } else {
    if (!TOOL_REGISTRY.some((t) => t.name === input.key)) throw new ApiError(404, 'not_found', 'Unknown tool.');
    await updateToolOverride(input.key, {
      enabled: input.patch.enabled,
      requiresApproval: input.patch.requiresApproval,
      timeoutMs: input.patch.timeoutMs,
    });
  }
  await writeAudit({ userId: admin.id, category: 'admin', action: `admin.${input.target}_config`, target: input.key, ip: clientIp(req), metadata: { fields: Object.keys(input.patch) } });
  return jsonOk({ ok: true });
});
