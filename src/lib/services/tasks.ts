import { query, queryOne } from '@/lib/database/pool';

export type TaskDto = {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  progress: number;
  dueAt: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: TaskDto['status'];
  progress: number;
  due_at: Date | null;
  project_id: string | null;
  created_at: Date;
  updated_at: Date;
};

const toDto = (r: TaskRow): TaskDto => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status,
  progress: r.progress,
  dueAt: r.due_at ? new Date(r.due_at).toISOString() : null,
  projectId: r.project_id,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listTasks(userId: string, status?: string): Promise<TaskDto[]> {
  const rows = status
    ? await query<TaskRow>(`SELECT * FROM tasks WHERE user_id = $1 AND status = $2 ORDER BY updated_at DESC LIMIT 200`, [userId, status])
    : await query<TaskRow>(`SELECT * FROM tasks WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200`, [userId]);
  return rows.map(toDto);
}

export async function createTask(
  userId: string,
  input: { title: string; description?: string; status?: TaskDto['status']; progress?: number; dueAt?: string | null; projectId?: string | null },
): Promise<TaskDto> {
  const row = await queryOne<TaskRow>(
    `INSERT INTO tasks (user_id, title, description, status, progress, due_at, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      userId,
      input.title,
      input.description ?? '',
      input.status ?? 'todo',
      input.progress ?? 0,
      input.dueAt ?? null,
      input.projectId ?? null,
    ],
  );
  return toDto(row!);
}

export async function updateTask(
  userId: string,
  id: string,
  patch: { title?: string; description?: string; status?: TaskDto['status']; progress?: number; dueAt?: string | null },
): Promise<TaskDto | null> {
  // Completing a task sets progress to 100; reopening keeps the last progress value.
  const progress = patch.status === 'done' ? 100 : (patch.progress ?? null);
  const row = await queryOne<TaskRow>(
    `UPDATE tasks SET
       title = COALESCE($3, title),
       description = COALESCE($4, description),
       status = COALESCE($5, status),
       progress = COALESCE($6, progress),
       due_at = CASE WHEN $7::boolean THEN $8::timestamptz ELSE due_at END,
       updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, patch.title ?? null, patch.description ?? null, patch.status ?? null, progress, patch.dueAt !== undefined, patch.dueAt ?? null],
  );
  return row ? toDto(row) : null;
}

export async function deleteTask(userId: string, id: string): Promise<boolean> {
  return (await query(`DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId])).length > 0;
}
