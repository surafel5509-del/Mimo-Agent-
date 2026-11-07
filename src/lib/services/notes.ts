import { query, queryOne } from '@/lib/database/pool';
import { escapeLike } from './conversations';

export type NoteDto = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

type NoteRow = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  project_id: string | null;
  created_at: Date;
  updated_at: Date;
};

const toDto = (r: NoteRow): NoteDto => ({
  id: r.id,
  title: r.title,
  content: r.content,
  tags: r.tags ?? [],
  projectId: r.project_id,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listNotes(userId: string, q?: string, limit = 100): Promise<NoteDto[]> {
  const rows = q?.trim()
    ? await query<NoteRow>(
        `SELECT * FROM notes WHERE user_id = $1 AND (title ILIKE $2 ESCAPE '\\' OR content ILIKE $2 ESCAPE '\\')
         ORDER BY updated_at DESC LIMIT $3`,
        [userId, `%${escapeLike(q.trim())}%`, limit],
      )
    : await query<NoteRow>(`SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`, [userId, limit]);
  return rows.map(toDto);
}

export async function createNote(
  userId: string,
  input: { title: string; content: string; tags: string[]; projectId?: string | null },
): Promise<NoteDto> {
  const row = await queryOne<NoteRow>(
    `INSERT INTO notes (user_id, title, content, tags, project_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, input.title, input.content, input.tags, input.projectId ?? null],
  );
  return toDto(row!);
}

export async function updateNote(
  userId: string,
  id: string,
  patch: { title?: string; content?: string; tags?: string[] },
): Promise<NoteDto | null> {
  const row = await queryOne<NoteRow>(
    `UPDATE notes SET title = COALESCE($3, title), content = COALESCE($4, content), tags = COALESCE($5, tags), updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, patch.title ?? null, patch.content ?? null, patch.tags ?? null],
  );
  return row ? toDto(row) : null;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  return (await query(`DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId])).length > 0;
}

/** Full-text search over a user's notes, ranked. Used by memory retrieval. */
export async function searchNotesFts(userId: string, q: string, limit = 5): Promise<NoteDto[]> {
  const rows = await query<NoteRow>(
    `SELECT *, ts_rank(tsv, websearch_to_tsquery('simple', $2)) AS rank
       FROM notes WHERE user_id = $1 AND tsv @@ websearch_to_tsquery('simple', $2)
       ORDER BY rank DESC LIMIT $3`,
    [userId, q, limit],
  );
  return rows.map(toDto);
}
