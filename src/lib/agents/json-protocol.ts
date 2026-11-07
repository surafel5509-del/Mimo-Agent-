/**
 * Fallback tool protocol for models without native function calling. The model must answer
 * with a single JSON object {"tool": "...", "input": {...}}. Anything else is a final answer.
 */
export type ToolRequest = { tool: string; input: unknown };

export function parseToolRequest(text: string): ToolRequest | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('`')) return null;
  const candidates: string[] = [];
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(trimmed);
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c) as Record<string, unknown>;
      if (obj && typeof obj === 'object' && typeof obj.tool === 'string' && /^[a-z_]{3,40}$/.test(obj.tool)) {
        return { tool: obj.tool, input: obj.input ?? {} };
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

export function describeToolProtocol(tools: { name: string; description: string; schema: unknown }[]): string {
  const list = tools
    .map((t) => `- ${t.name}: ${t.description}\n  input schema: ${JSON.stringify(t.schema)}`)
    .join('\n');
  return [
    'TOOL PROTOCOL: You cannot run tools yourself. When you need a tool, reply with ONLY one JSON object on a single line and nothing else:',
    '{"tool":"<tool name>","input":{...}}',
    'After the tool result arrives (a message starting with TOOL_RESULT or TOOL_ERROR), continue. When you have enough information, answer the user normally without JSON.',
    'Available tools:',
    list || '(none available for this mode)',
  ].join('\n');
}
