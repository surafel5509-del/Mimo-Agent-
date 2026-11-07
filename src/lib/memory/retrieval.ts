import 'server-only';
import { query, queryOne } from '@/lib/database/pool';
import { getEnv } from '@/lib/config';
import { searchMemoriesFts } from '@/lib/services/memories';
import { searchNotesFts } from '@/lib/services/notes';
import { searchChunks } from '@/lib/services/documents';
import { getChatProvider } from '@/lib/ai/nvidia';
import { wrapUntrusted } from '@/lib/security/sanitize';
import { log } from '@/lib/logging/logger';

export type ContextRef = {
  kind: 'memory' | 'note' | 'document';
  id: string;
  title: string;
  snippet: string;
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'has', 'have',
  'this', 'that', 'with', 'from', 'they', 'will', 'what', 'when', 'where', 'which', 'your', 'about', 'please',
  'could', 'would', 'should', 'there', 'their', 'them', 'then', 'than', 'into', 'just', 'like', 'make', 'need',
]);

/** Builds a safe full-text query from free text: keywords joined with OR. Returns '' when none. */
export function keywordQuery(text: string): string {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOPWORDS.has(w));
  const unique = [...new Set(words)].slice(0, 8);
  return unique.join(' or ');
}

let vectorColumnsKnown: boolean | null = null;

/** True when migration 002 (pgvector) has been applied on this database. */
export async function hasVectorSupport(): Promise<boolean> {
  if (vectorColumnsKnown !== null) return vectorColumnsKnown;
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'embedding') AS ok`,
  );
  vectorColumnsKnown = Boolean(row?.ok);
  return vectorColumnsKnown;
}

export function resetVectorCache(): void {
  vectorColumnsKnown = null;
}

export const toVectorLiteral = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;

/** Embeds text with the configured embedding model. Returns null if semantic search is disabled. */
export async function embedQuery(text: string): Promise<number[] | null> {
  if (!getEnv().NVIDIA_EMBEDDING_MODEL) return null;
  try {
    const [vec] = await getChatProvider().embed([text.slice(0, 4000)]);
    return vec ?? null;
  } catch (err) {
    log('warn', 'memory.embed_failed', { message: (err as Error).message });
    return null;
  }
}

async function semanticChunks(userId: string, vec: number[], documentIds: string[] | undefined, limit: number) {
  const params: unknown[] = [userId, toVectorLiteral(vec), limit];
  const filter = documentIds && documentIds.length ? 'AND c.document_id = ANY($4::uuid[])' : '';
  if (filter) params.push(documentIds);
  return query<{ documentId: string; documentName: string; chunkIndex: number; content: string }>(
    `SELECT c.document_id AS "documentId", d.original_name AS "documentName", c.chunk_index AS "chunkIndex", c.content
       FROM document_chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.user_id = $1 AND d.status = 'ready' AND c.embedding IS NOT NULL ${filter}
      ORDER BY c.embedding <=> $2::vector LIMIT $3`,
    params,
  );
}

async function semanticMemories(userId: string, vec: number[], limit: number) {
  return query<{ id: string; content: string }>(
    `SELECT id, content FROM memories WHERE user_id = $1 AND embedding IS NOT NULL
      ORDER BY embedding <=> $2::vector LIMIT $3`,
    [userId, toVectorLiteral(vec), limit],
  );
}

/**
 * Retrieves context for a new request: user memories, notes and document excerpts.
 * Results are scoped to the authenticated user by every query. Hybrid search: full-text
 * always, plus pgvector similarity when embeddings and the vector schema are available.
 */
export async function retrieveContext(input: {
  userId: string;
  text: string;
  documentIds?: string[];
  includeMemory: boolean;
  documentLimit?: number;
}): Promise<{ block: string; refs: ContextRef[] }> {
  const kw = keywordQuery(input.text);
  const vec = kw || input.text.length > 20 ? await embedQuery(input.text) : null;
  const vectorOn = Boolean(vec) && (await hasVectorSupport());
  const refs: ContextRef[] = [];
  const memoryLines: string[] = [];
  const docLines: string[] = [];

  if (input.includeMemory) {
    const memories = kw ? await searchMemoriesFts(input.userId, kw, 5) : [];
    const seen = new Set<string>();
    if (vectorOn && vec) {
      for (const m of await semanticMemories(input.userId, vec, 5)) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          memories.push({ id: m.id, kind: 'fact', content: m.content, source: 'user', projectId: null, createdAt: '' });
        }
      }
    }
    for (const m of memories.slice(0, 6)) {
      if (refs.some((r) => r.id === m.id)) continue;
      refs.push({ kind: 'memory', id: m.id, title: `${m.kind} memory`, snippet: m.content.slice(0, 160) });
      memoryLines.push(`- (${m.kind}) ${m.content}`);
    }
    const notes = kw ? await searchNotesFts(input.userId, kw, 3) : [];
    for (const n of notes) {
      refs.push({ kind: 'note', id: n.id, title: n.title, snippet: n.content.slice(0, 160) });
      memoryLines.push(`- Note "${n.title}": ${n.content.slice(0, 600)}`);
    }
  }

  if (kw || vectorOn) {
    const limit = input.documentLimit ?? 5;
    const hits = kw ? await searchChunks(input.userId, kw, { documentIds: input.documentIds, limit }) : [];
    const chunks = hits.map((h) => ({ documentId: h.documentId, documentName: h.documentName, chunkIndex: h.chunkIndex, content: h.content }));
    if (vectorOn && vec) {
      for (const c of await semanticChunks(input.userId, vec, input.documentIds, limit)) {
        if (!chunks.some((x) => x.documentId === c.documentId && x.chunkIndex === c.chunkIndex)) chunks.push(c);
      }
    }
    for (const c of chunks.slice(0, limit)) {
      refs.push({ kind: 'document', id: c.documentId, title: `${c.documentName} #${c.chunkIndex + 1}`, snippet: c.content.slice(0, 160) });
      docLines.push(`[${c.documentName} · chunk ${c.chunkIndex + 1}] ${c.content}`);
    }
  }

  const parts: string[] = [];
  if (memoryLines.length) parts.push(wrapUntrusted('memory', memoryLines.join('\n'), 3000));
  if (docLines.length) parts.push(wrapUntrusted('documents', docLines.join('\n\n'), 6000));
  return { block: parts.join('\n\n'), refs };
}
