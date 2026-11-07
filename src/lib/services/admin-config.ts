import { query } from '@/lib/database/pool';
import type { ToolOverride } from '@/lib/tools/registry';

export type AgentOverride = {
  enabled: boolean;
  allowedTools: string[] | null;
  temperature: number | null;
  systemPromptOverride: string | null;
};

export async function getAgentOverrides(): Promise<Map<string, AgentOverride>> {
  const rows = await query<{ key: string; enabled: boolean; allowed_tools: string[] | null; temperature: string | null; system_prompt_override: string | null }>(
    `SELECT key, enabled, allowed_tools, temperature, system_prompt_override FROM agents`,
  );
  return new Map(
    rows.map((r) => [
      r.key,
      {
        enabled: r.enabled,
        allowedTools: r.allowed_tools,
        temperature: r.temperature === null ? null : Number(r.temperature),
        systemPromptOverride: r.system_prompt_override,
      },
    ]),
  );
}

export async function updateAgentOverride(key: string, patch: Partial<AgentOverride>): Promise<void> {
  await query(
    `INSERT INTO agents (key, enabled, allowed_tools, temperature, system_prompt_override)
     VALUES ($1, COALESCE($2, true), $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET
       enabled = COALESCE($2, agents.enabled),
       allowed_tools = CASE WHEN $6::boolean THEN $3 ELSE agents.allowed_tools END,
       temperature = CASE WHEN $7::boolean THEN $4 ELSE agents.temperature END,
       system_prompt_override = CASE WHEN $8::boolean THEN $5 ELSE agents.system_prompt_override END,
       updated_at = now()`,
    [
      key,
      patch.enabled ?? null,
      patch.allowedTools ?? null,
      patch.temperature ?? null,
      patch.systemPromptOverride ?? null,
      patch.allowedTools !== undefined,
      patch.temperature !== undefined,
      patch.systemPromptOverride !== undefined,
    ],
  );
}

export async function getToolOverrides(): Promise<Map<string, ToolOverride>> {
  const rows = await query<{ name: string; enabled: boolean; requires_approval: boolean | null; timeout_ms: number | null }>(
    `SELECT name, enabled, requires_approval, timeout_ms FROM tools`,
  );
  return new Map(rows.map((r) => [r.name, { enabled: r.enabled, requiresApproval: r.requires_approval, timeoutMs: r.timeout_ms }]));
}

export async function updateToolOverride(name: string, patch: { enabled?: boolean; requiresApproval?: boolean | null; timeoutMs?: number | null }): Promise<void> {
  await query(
    `INSERT INTO tools (name, enabled, requires_approval, timeout_ms)
     VALUES ($1, COALESCE($2, true), $3, $4)
     ON CONFLICT (name) DO UPDATE SET
       enabled = COALESCE($2, tools.enabled),
       requires_approval = CASE WHEN $5::boolean THEN $3 ELSE tools.requires_approval END,
       timeout_ms = CASE WHEN $6::boolean THEN $4 ELSE tools.timeout_ms END,
       updated_at = now()`,
    [name, patch.enabled ?? null, patch.requiresApproval ?? null, patch.timeoutMs ?? null, patch.requiresApproval !== undefined, patch.timeoutMs !== undefined],
  );
}
