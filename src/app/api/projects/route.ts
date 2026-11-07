import { apiRoute, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { projectSchema } from '@/lib/validation/schemas';
import { createProject, listProjects } from '@/lib/services/projects';
import { writeAudit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return jsonOk({ projects: await listProjects(user.id) });
});

export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const input = projectSchema.parse(await readJson(req));
  const row = await createProject(user.id, input);
  await writeAudit({ userId: user.id, category: 'data', action: 'project.create', target: row?.id });
  return jsonOk({ id: row?.id }, { status: 201 });
});
