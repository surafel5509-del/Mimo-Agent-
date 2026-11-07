import { z } from 'zod';
import { passwordSchema } from '@/lib/security/passwords';
import { cleanText } from '@/lib/security/sanitize';
import { AGENT_MODE_IDS } from '@/lib/agents/modes';

const text = (max: number) => z.string().max(max).transform(cleanText);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('Enter a valid email address.');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: text(80).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const chatSchema = z
  .object({
    conversationId: z.uuid().optional(),
    mode: z.enum(AGENT_MODE_IDS).default('general'),
    model: z.string().min(1).max(120).optional(),
    message: text(8000).optional(),
    attachmentIds: z.array(z.uuid()).max(5).default([]),
    /** Regenerate the last assistant reply from the last user message. */
    regenerate: z.boolean().default(false),
    projectId: z.uuid().nullable().optional(),
  })
  .refine((v) => v.regenerate || (v.message && v.message.trim().length > 0), {
    message: 'A message is required.',
    path: ['message'],
  });

export const conversationPatchSchema = z
  .object({
    title: text(200).optional(),
    mode: z.enum(AGENT_MODE_IDS).optional(),
    model: z.string().min(1).max(120).nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied.');

export const messageEditSchema = z.object({ content: text(8000).pipe(z.string().min(1)) });

export const feedbackSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: text(1000).optional(),
});

export const noteCreateSchema = z.object({
  title: text(200).pipe(z.string().min(1)),
  content: text(50000).default(''),
  tags: z.array(text(40).pipe(z.string().min(1))).max(20).default([]),
  projectId: z.uuid().nullable().optional(),
});

export const noteUpdateSchema = z
  .object({
    title: text(200).pipe(z.string().min(1)).optional(),
    content: text(50000).optional(),
    tags: z.array(text(40).pipe(z.string().min(1))).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied.');

export const memoryCreateSchema = z.object({
  kind: z.enum(['preference', 'fact', 'project']),
  content: text(2000).pipe(z.string().min(1)),
  projectId: z.uuid().nullable().optional(),
});

export const taskCreateSchema = z.object({
  title: text(200).pipe(z.string().min(1)),
  description: text(4000).default(''),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'),
  progress: z.number().int().min(0).max(100).default(0),
  dueAt: z.iso.datetime().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
});

export const taskUpdateSchema = z
  .object({
    title: text(200).pipe(z.string().min(1)).optional(),
    description: text(4000).optional(),
    status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    dueAt: z.iso.datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied.');

export const projectSchema = z.object({
  name: text(120).pipe(z.string().min(1)),
  description: text(1000).default(''),
  instructions: text(8000).default(''),
});

export const settingsPatchSchema = z
  .object({
    displayName: text(80).optional(),
    locale: z.enum(['en']).optional(),
    preferences: z
      .object({
        theme: z.enum(['dark', 'light', 'system']).optional(),
        timezone: z.string().min(1).max(64).optional(),
        defaultModel: z.string().min(1).max(120).optional(),
        defaultMode: z.enum(AGENT_MODE_IDS).optional(),
        memoryEnabled: z.boolean().optional(),
        useHistory: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied.');

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});

export const approvalDecisionSchema = z.object({ decision: z.enum(['approve', 'deny']) });

export const accountDeleteSchema = z.object({ password: z.string().min(1).max(256), confirm: z.literal('DELETE') });

export const adminUserPatchSchema = z
  .object({
    role: z.enum(['user', 'admin']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied.');

export const agentConfigSchema = z.object({
  enabled: z.boolean().optional(),
  allowedTools: z.array(z.string().min(1).max(60)).max(30).optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  systemPromptOverride: z.string().max(8000).nullable().optional(),
});

export const toolConfigSchema = z.object({
  enabled: z.boolean().optional(),
  requiresApproval: z.boolean().nullable().optional(),
  timeoutMs: z.number().int().min(1000).max(120000).nullable().optional(),
});

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
