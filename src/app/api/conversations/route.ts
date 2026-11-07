import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { ApiError } from '@/lib/http/errors';
import { createConversation, listConversations, toConversationDto } from '@/lib/services/conversations';
import { AGENT_MODE_IDS } from '@/lib/agents/modes';
import { getModelOptions } from '@/lib/config';
import { z } from 'zod';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const q = new URL(req.url).searchParams.get('q') ?? undefined;
  return jsonOk({ conversations: await listConversations(user.id, { q: q?.slice(0, 200) }) });
});

const createSchema = z.object({
  mode: z.enum(AGENT_MODE_IDS).optional(),
  model: z.string().max(120).optional(),
  projectId: z.uuid().nullable().optional(),
  title: z.string().max(200).optional(),
});

export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const input = createSchema.parse(await readJson(req));
  if (input.model && !getModelOptions().includes(input.model)) throw new ApiError(400, 'model_not_allowed', 'That model is not enabled.');
  try {
    const row = await createConversation(user.id, input);
    await writeAudit({ userId: user.id, category: 'data', action: 'conversation.create', target: row.id });
    return jsonOk({ conversation: toConversationDto(row) }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'PROJECT_NOT_OWNED') throw new ApiError(404, 'not_found', 'Project was not found.');
    throw err;
  }
});
