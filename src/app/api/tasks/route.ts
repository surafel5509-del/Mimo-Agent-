import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { taskCreateSchema } from '@/lib/validation/schemas';
import { createTask, listTasks } from '@/lib/services/tasks';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const status = new URL(req.url).searchParams.get('status') ?? undefined;
  return jsonOk({ tasks: await listTasks(user.id, status) });
});

export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const input = taskCreateSchema.parse(await readJson(req));
  return jsonOk({ task: await createTask(user.id, input) }, { status: 201 });
});
