import { query, queryOne } from '@/lib/database/pool';

export type ProjectDto = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
  conversationCount: number;
};

export async function listProjects(userId: string): Promise<ProjectDto[]> {
  const rows = await query<{ id: string; name: string; description: string; instructions: string; created_at: Date; updated_at: Date; conversation_count: string }>(
    `SELECT p.*, (SELECT count(*) FROM conversations c WHERE c.project_id = p.id)::text AS conversation_count
       FROM projects p WHERE p.user_id = $1 ORDER BY p.updated_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    instructions: r.instructions,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    conversationCount: Number(r.conversation_count),
  }));
}

export async function createProject(userId: string, input: { name: string; description: string; instructions: string }) {
  return queryOne<{ id: string }>(
    `INSERT INTO projects (user_id, name, description, instructions) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, input.name, input.description, input.instructions],
  );
}

export async function updateProject(userId: string, id: string, patch: { name?: string; description?: string; instructions?: string }) {
  return queryOne<{ id: string }>(
    `UPDATE projects SET name = COALESCE($3, name), description = COALESCE($4, description), instructions = COALESCE($5, instructions), updated_at = now()
      WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId, patch.name ?? null, patch.description ?? null, patch.instructions ?? null],
  );
}

export async function deleteProject(userId: string, id: string): Promise<boolean> {
  return (await query(`DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId])).length > 0;
}

export async function getProjectInstructions(userId: string, projectId: string): Promise<string | null> {
  const row = await queryOne<{ instructions: string }>(`SELECT instructions FROM projects WHERE id = $1 AND user_id = $2`, [projectId, userId]);
  return row?.instructions ?? null;
}
