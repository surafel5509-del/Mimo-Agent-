import { z } from 'zod';
import type { ToolDefinition } from './types';
import { ToolError } from './types';
import { createMemory, searchMemoriesFts } from '@/lib/services/memories';
import { searchNotesFts } from '@/lib/services/notes';

export const memorySearchTool: ToolDefinition<z.ZodObject<{ query: z.ZodString }>> = {
  name: 'memory_search',
  title: 'Memory search',
  description: 'Search the user\'s saved memories and notes for relevant context.',
  permission: 'read',
  inputSchema: z.object({ query: z.string().min(2).max(300) }),
  timeoutMs: 3000,
  requiresApproval: () => false,
  async execute(input, ctx) {
    const [memories, notes] = await Promise.all([
      searchMemoriesFts(ctx.userId, input.query, 5),
      searchNotesFts(ctx.userId, input.query, 5),
    ]);
    return {
      data: {
        memories: memories.map((m) => ({ id: m.id, kind: m.kind, content: m.content })),
        notes: notes.map((n) => ({ id: n.id, title: n.title, content: n.content.slice(0, 800) })),
      },
      summary: `${memories.length} memories, ${notes.length} notes`,
    };
  },
};

const saveSchema = z.object({
  kind: z.enum(['preference', 'fact']),
  content: z.string().min(3).max(2000),
});

export const memorySaveTool: ToolDefinition<typeof saveSchema> = {
  name: 'memory_save',
  title: 'Save memory',
  description:
    'Save a preference or fact to long-term memory. Always requires the user\'s approval. Never save passwords, financial account numbers, health data or other sensitive personal information.',
  permission: 'sensitive',
  inputSchema: saveSchema,
  timeoutMs: 3000,
  requiresApproval: () => true,
  describeAction: (input) => ({
    summary: `Remember ${input.kind}: "${input.content.slice(0, 120)}"`,
    consequences: 'This will be stored in your memory and may be used in future conversations. You can delete it from the Memory page at any time.',
  }),
  async execute(input, ctx) {
    if (!ctx.approved) throw new ToolError('denied', 'Saving memory requires your approval.');
    const sensitive = /\b(password|passwd|api[_ -]?key|secret|token|\d{12,19}|iban|ssn)\b/i.test(input.content);
    if (sensitive) throw new ToolError('denied', 'This looks sensitive, so it was not saved.');
    const mem = await createMemory(ctx.userId, { kind: input.kind, content: input.content, source: 'agent_approved' });
    return { data: { id: mem.id }, summary: 'Saved to memory' };
  },
};
