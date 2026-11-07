import { z } from 'zod';
import { calculatorTool } from './calculator';
import { datetimeTool } from './datetime';
import { notesTool } from './notes-tool';
import { tasksTool } from './tasks-tool';
import { memorySaveTool, memorySearchTool } from './memory-tools';
import { webSearchTool } from './web-search';
import { dataAnalysisTool, documentReaderTool, imageAnalysisTool } from './document-tools';
import { codeAssistantTool } from './code-assistant';
import type { ToolDefinition } from './types';

/**
 * The tool registry is the ONLY way the model can act. Each tool validates its input with
 * zod, declares its permission and approval rule, and runs under a timeout. Nothing here
 * executes shell commands or arbitrary code.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOL_REGISTRY: ToolDefinition<any>[] = [
  calculatorTool,
  datetimeTool,
  notesTool,
  tasksTool,
  memorySearchTool,
  memorySaveTool,
  webSearchTool,
  documentReaderTool,
  dataAnalysisTool,
  codeAssistantTool,
  imageAnalysisTool,
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

/** Tools whose output comes from user documents or the web and must be treated as untrusted. */
export const UNTRUSTED_OUTPUT_TOOLS = new Set(['web_search', 'document_reader', 'data_analysis', 'image_analysis', 'notes', 'memory_search']);

/**
 * JSON Schema for native function calling, derived from the zod input schema.
 * Discriminated unions become a single flat object (OpenAI-compatible APIs require a top-level
 * `type: "object"`). Runtime validation still uses the full zod schema.
 */
export function toolJsonSchema(def: ToolDefinition): Record<string, unknown> {
  const schema = z.toJSONSchema(def.inputSchema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete schema.$schema;
  if (schema.type === 'object') return schema;
  const variants = (schema.oneOf ?? schema.anyOf) as Record<string, any>[] | undefined;
  if (!variants?.length) return { type: 'object', properties: {}, additionalProperties: false };
  const properties: Record<string, unknown> = {};
  for (const v of variants) {
    for (const [key, prop] of Object.entries((v.properties ?? {}) as Record<string, any>)) {
      const prev = properties[key] as Record<string, any> | undefined;
      if (!prev) properties[key] = prop;
      else if (prop.enum && prev.enum) properties[key] = { ...prev, enum: [...new Set([...prev.enum, ...prop.enum])] };
    }
  }
  return { type: 'object', properties, additionalProperties: false, description: 'Provide the fields required by the chosen operation.' };
}

export type ToolOverride = {
  enabled?: boolean;
  requiresApproval?: boolean | null;
  timeoutMs?: number | null;
};

export type ResolvedTool = {
  def: ToolDefinition;
  enabled: boolean;
  requiresApproval: (input: unknown) => boolean;
  timeoutMs: number;
};

export function resolveTool(def: ToolDefinition, override?: ToolOverride): ResolvedTool {
  const forced = override?.requiresApproval;
  return {
    def,
    enabled: override?.enabled ?? true,
    requiresApproval: (input) => (typeof forced === 'boolean' ? forced : def.requiresApproval(input)),
    timeoutMs: override?.timeoutMs ?? def.timeoutMs,
  };
}

/** Resolves a tool by name with overrides applied. Returns undefined for unknown tools. */
export function getDefaultToolResolved(name: string, override?: ToolOverride): ResolvedTool | undefined {
  const def = getToolDefinition(name);
  return def ? resolveTool(def, override) : undefined;
}
