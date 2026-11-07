import { apiRoute, clientIp, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { memoryCreateSchema } from '@/lib/validation/schemas';
import { createMemory, listMemories } from '@/lib/services/memories';
import { writeAudit } from '@/lib/services/audit';
import { cleanText } from '@/lib/security/sanitize';
import { ApiError } from '@/lib/http/errors';

export const dynamic = 'force-dynamic';

const SENSITIVE = /\b(password|passwd|api[_ -]?key|secret|token|\d{12,19}|iban|ssn)\b/i;

export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const q = new URL(req.url).searchParams.get('q') ?? undefined;
  return jsonOk({ memories: await listMemories(user.id, q?.slice(0, 200)) });
});

/** Users may add memories directly. Sensitive-looking content is refused. */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const input = memoryCreateSchema.parse(await readJson(req));
  const content = cleanText(input.content);
  if (SENSITIVE.test(content)) throw new ApiError(422, 'sensitive_content', 'This looks like sensitive information, so it was not stored.');
  const mem = await createMemory(user.id, { kind: input.kind, content, source: 'user', projectId: input.projectId ?? null });
  await writeAudit({ userId: user.id, category: 'data', action: 'memory.create', target: mem.id, ip: clientIp(req) });
  return jsonOk({ memory: mem }, { status: 201 });
});
