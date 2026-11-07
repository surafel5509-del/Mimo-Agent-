import { query, queryOne, withTransaction } from '@/lib/database/pool';
import { deleteObject } from '@/lib/storage/object-store';
import type { CsvSummary } from '@/lib/tools/csv-analysis';

export type DocumentRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  original_name: string;
  extension: string;
  mime_type: string;
  kind: 'document' | 'data' | 'image';
  size_bytes: string;
  sha256: string;
  storage_key: string;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  error_message: string | null;
  text_chars: number;
  summary: unknown;
  created_at: Date;
  updated_at: Date;
};

export type DocumentDto = {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  kind: DocumentRow['kind'];
  sizeBytes: number;
  status: DocumentRow['status'];
  errorMessage: string | null;
  textChars: number;
  projectId: string | null;
  summary: Record<string, unknown>;
  createdAt: string;
};

export const toDocumentDto = (d: DocumentRow): DocumentDto => ({
  id: d.id,
  name: d.original_name,
  extension: d.extension,
  mimeType: d.mime_type,
  kind: d.kind,
  sizeBytes: Number(d.size_bytes),
  status: d.status,
  errorMessage: d.error_message,
  textChars: d.text_chars,
  projectId: d.project_id,
  summary: (d.summary && typeof d.summary === 'object' ? d.summary : {}) as Record<string, unknown>,
  createdAt: new Date(d.created_at).toISOString(),
});

export async function listDocuments(userId: string): Promise<DocumentDto[]> {
  const rows = await query<DocumentRow>(`SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [userId]);
  return rows.map(toDocumentDto);
}

export async function getDocument(userId: string, id: string): Promise<DocumentRow | null> {
  return queryOne<DocumentRow>(`SELECT * FROM documents WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function createDocumentRecord(input: {
  userId: string;
  name: string;
  extension: string;
  mimeType: string;
  kind: DocumentRow['kind'];
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  projectId?: string | null;
}): Promise<DocumentRow> {
  const row = await queryOne<DocumentRow>(
    `INSERT INTO documents (user_id, original_name, extension, mime_type, kind, size_bytes, sha256, storage_key, status, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9) RETURNING *`,
    [input.userId, input.name, input.extension, input.mimeType, input.kind, input.sizeBytes, input.sha256, input.storageKey, input.projectId ?? null],
  );
  return row!;
}

export async function markDocumentError(id: string, message: string): Promise<void> {
  await query(`UPDATE documents SET status = 'error', error_message = $2, updated_at = now() WHERE id = $1`, [id, message.slice(0, 500)]);
}

/** Stores extracted chunks and marks the document ready. Replaces any previous chunks. */
export async function saveDocumentContent(
  id: string,
  userId: string,
  chunks: string[],
  meta: { textChars: number; summary: Record<string, unknown> | CsvSummary },
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM document_chunks WHERE document_id = $1`, [id]);
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO document_chunks (document_id, user_id, chunk_index, content, token_estimate) VALUES ($1, $2, $3, $4, $5)`,
        [id, userId, i, chunks[i], Math.ceil(chunks[i].length / 4)],
      );
    }
    await client.query(
      `UPDATE documents SET status = 'ready', text_chars = $3, summary = $4, error_message = NULL, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, userId, meta.textChars, meta.summary],
    );
  });
}

export async function deleteDocument(userId: string, id: string): Promise<boolean> {
  const row = await queryOne<{ storage_key: string }>(
    `DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING storage_key`,
    [id, userId],
  );
  if (!row) return false;
  await deleteObject(row.storage_key).catch(() => undefined);
  return true;
}

/** Full-text retrieval over a user's document chunks. Optionally restricted to specific documents. */
export async function searchChunks(
  userId: string,
  q: string,
  opts: { documentIds?: string[]; limit?: number } = {},
): Promise<{ documentId: string; documentName: string; chunkIndex: number; content: string; rank: number }[]> {
  const limit = opts.limit ?? 6;
  const docFilter = opts.documentIds && opts.documentIds.length > 0 ? 'AND c.document_id = ANY($4::uuid[])' : '';
  const params: unknown[] = [userId, q, limit];
  if (docFilter) params.push(opts.documentIds);
  return query(
    `SELECT c.document_id AS "documentId", d.original_name AS "documentName", c.chunk_index AS "chunkIndex", c.content,
            ts_rank(c.tsv, websearch_to_tsquery('simple', $2)) AS rank
       FROM document_chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.user_id = $1 AND d.status = 'ready' AND c.tsv @@ websearch_to_tsquery('simple', $2) ${docFilter}
      ORDER BY rank DESC LIMIT $3`,
    params,
  );
}

/** Returns chunks in document order (used for summaries). */
export async function getDocumentChunks(
  userId: string,
  documentId: string,
  opts: { offset?: number; limit?: number } = {},
): Promise<{ chunkIndex: number; content: string }[]> {
  return query(
    `SELECT c.chunk_index AS "chunkIndex", c.content FROM document_chunks c
      WHERE c.user_id = $1 AND c.document_id = $2 ORDER BY c.chunk_index OFFSET $3 LIMIT $4`,
    [userId, documentId, opts.offset ?? 0, opts.limit ?? 8],
  );
}
