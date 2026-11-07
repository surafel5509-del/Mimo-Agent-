import { z } from 'zod';
import type { ToolDefinition } from './types';
import { ToolError } from './types';
import { createNote, deleteNote, listNotes, updateNote } from '@/lib/services/notes';

const tags = z.array(z.string().min(1).max(40)).max(20);

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), query: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).default(10) }),
  z.object({
    action: z.literal('create'),
    title: z.string().min(1).max(200),
    content: z.string().max(50000).default(''),
    tags: tags.default([]),
  }),
  z.object({
    action: z.literal('update'),
    id: z.uuid(),
    title: z.string().min(1).max(200).optional(),
    content: z.string().max(50000).optional(),
    tags: tags.optional(),
  }),
  z.object({ action: z.literal('delete'), id: z.uuid() }),
]);

type Input = z.infer<typeof inputSchema>;

export const notesTool: ToolDefinition<typeof inputSchema> = {
  name: 'notes',
  title: 'Notes',
  description:
    'Manage the user\'s notes. action=list (optional query) and action=create (title, content, tags) run immediately. action=update (id + changes) and action=delete (id) require the user\'s approval.',
  permission: 'write',
  inputSchema,
  timeoutMs: 5000,
  requiresApproval: (input: Input) => input.action === 'update' || input.action === 'delete',
  describeAction: (input: Input) => {
    if (input.action === 'delete') {
      return { summary: `Delete note ${input.id}`, consequences: 'The note will be permanently deleted and cannot be recovered.' };
    }
    if (input.action === 'update') {
      const fields = ['title', 'content', 'tags'].filter((f) => (input as any)[f] !== undefined);
      return { summary: `Update note ${input.id} (${fields.join(', ')})`, consequences: 'The previous text of the changed fields will be overwritten.' };
    }
    return { summary: 'Save a note', consequences: 'A new note is saved to your account.' };
  },
  async execute(input, ctx) {
    switch (input.action) {
      case 'list': {
        const notes = await listNotes(ctx.userId, input.query, input.limit);
        return {
          data: { notes: notes.map((n) => ({ id: n.id, title: n.title, content: n.content.slice(0, 1500), tags: n.tags, updatedAt: n.updatedAt })) },
          summary: `${notes.length} note(s) found`,
        };
      }
      case 'create': {
        const note = await createNote(ctx.userId, { title: input.title, content: input.content, tags: input.tags, projectId: ctx.projectId });
        return { data: { id: note.id, title: note.title }, summary: `Saved note "${note.title.slice(0, 60)}"` };
      }
      case 'update': {
        if (!ctx.approved) throw new ToolError('denied', 'Updating a note requires your approval.');
        const { action: _a, id, ...patch } = input;
        const note = await updateNote(ctx.userId, id, patch);
        if (!note) throw new ToolError('not_found', 'That note was not found.');
        return { data: { id: note.id, title: note.title }, summary: `Updated note "${note.title.slice(0, 60)}"` };
      }
      case 'delete': {
        if (!ctx.approved) throw new ToolError('denied', 'Deleting a note requires your approval.');
        const ok = await deleteNote(ctx.userId, input.id);
        if (!ok) throw new ToolError('not_found', 'That note was not found.');
        return { data: { deleted: true }, summary: 'Note deleted' };
      }
    }
  },
};
