import { query, queryOne } from '@/lib/database/pool';
import { escapeLike } from './conversations';

export type MemoryDto = {
  id: string;
  kind: 'preference' | 'fact' | 'project';
  content: string;
  source: 'user' | 'agent_approved';
  projectId: string | null;
  createdAt: string;
};

type MemoryRow = {
  id: string;
  kind: MemoryDto['kind'];
  content: string;
  source: MemoryDto['source'];
  project_id: string | null;
  created_at: Date;
};

const toDto = (r: MemoryRow): MemoryDto => ({
  id: r.id,
  kind: r.kind,
  content: r.content,
  source: r.source,
  projectId: r.project_id,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function listMemories(userId: string, q?: string): Promise<MemoryDto[]> {
  const rows = q?.trim()
    ? await query<MemoryRow>(
        `SELECT * FROM memories WHERE user_id = $1 AND content ILIKE $2 ESCAPE '\\' ORDER BY created_at DESC LIMIT 200`,
        [userId, `%${escapeLike(q.trim())}%`],
      )
    : await query<MemoryRow>(`SELECT * FROM memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [userId]);
  return rows.map(toDto);
}

export async function createMemory(
  userId: string,
  input: { kind: MemoryDto['kind']; content: string; source: MemoryDto['source']; projectId?: string | null },
): Promise<MemoryDto> {
  const row = await queryOne<MemoryRow>(
    `INSERT INTO memories (user_id, kind, content, source, project_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, input.kind, input.content, input.source, input.projectId ?? null],
  );
  return toDto(row!);
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  return (await query(`DELETE FROM memories WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId])).length > 0;
}

export async function searchMemoriesFts(userId: string, q: string, limit = 5): Promise<MemoryDto[]> {
  const rows = await query<MemoryRow>(
    `SELECT *, ts_rank(tsv, websearch_to_tsquery('simple', $2)) AS rank FROM memories
      WHERE user_id = $1 AND tsv @@ websearch_to_tsquery('simple', $2)
      ORDER BY rank DESC LIMIT $3`,
    [userId, q, limit],
  );
  return rows.map(toDto);
}
