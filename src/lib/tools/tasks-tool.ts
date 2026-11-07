import { z } from 'zod';
import type { ToolDefinition } from './types';
import { ToolError } from './types';
import { createTask, listTasks, updateTask } from '@/lib/services/tasks';

const status = z.enum(['todo', 'in_progress', 'blocked', 'done']);

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), status: status.optional() }),
  z.object({
    action: z.literal('create'),
    title: z.string().min(1).max(200),
    description: z.string().max(4000).default(''),
    dueAt: z.iso.datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal('update'),
    id: z.uuid(),
    status: status.optional(),
    progress: z.number().int().min(0).max(100).optional(),
  }),
]);

export const tasksTool: ToolDefinition<typeof inputSchema> = {
  name: 'tasks',
  title: 'Task manager',
  description:
    'Track work. action=list (optional status), action=create (title, description, dueAt ISO), action=update (id, status todo|in_progress|blocked|done, progress 0-100).',
  permission: 'write',
  inputSchema,
  timeoutMs: 5000,
  requiresApproval: () => false,
  async execute(input, ctx) {
    switch (input.action) {
      case 'list': {
        const tasks = await listTasks(ctx.userId, input.status);
        return {
          data: { tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, progress: t.progress, dueAt: t.dueAt })) },
          summary: `${tasks.length} task(s)`,
        };
      }
      case 'create': {
        const task = await createTask(ctx.userId, {
          title: input.title,
          description: input.description,
          dueAt: input.dueAt ?? null,
          projectId: ctx.projectId,
        });
        return { data: { id: task.id, title: task.title, status: task.status }, summary: `Created task "${task.title.slice(0, 60)}"` };
      }
      case 'update': {
        const task = await updateTask(ctx.userId, input.id, { status: input.status, progress: input.progress });
        if (!task) throw new ToolError('not_found', 'That task was not found.');
        return { data: { id: task.id, status: task.status, progress: task.progress }, summary: `Task now ${task.status} (${task.progress}%)` };
      }
    }
  },
};
