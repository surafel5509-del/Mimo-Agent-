import { createHash } from 'node:crypto';
import { apiRoute, clientIp, jsonOk } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { ApiError } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { writeAudit } from '@/lib/services/audit';
import { createDocumentRecord, listDocuments, markDocumentError, saveDocumentContent, toDocumentDto, getDocument } from '@/lib/services/documents';
import { allowedExtension, validateUpload, MAX_UPLOAD_BYTES } from '@/lib/storage/file-validation';
import { newStorageKey, putObject } from '@/lib/storage/object-store';
import { extractText } from '@/lib/memory/extract';
import { chunkText } from '@/lib/memory/chunking';
import { parseCsv, summarizeRows } from '@/lib/tools/csv-analysis';
import { safeFilename } from '@/lib/security/sanitize';
import { getChatProvider } from '@/lib/ai/nvidia';
import { getEnv } from '@/lib/config';
import { hasVectorSupport, toVectorLiteral } from '@/lib/memory/retrieval';
import { query } from '@/lib/database/pool';
import { log } from '@/lib/logging/logger';
import { recordUsage } from '@/lib/services/usage';
import { getProjectInstructions } from '@/lib/services/projects';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  return jsonOk({ documents: (await listDocuments(user.id)) });
});

/**
 * POST multipart/form-data with field "file" (and optional "projectId").
 * Pipeline: size → extension → content validation → private storage → text extraction →
 * chunking → optional embeddings → ready. Each failure leaves a visible error state.
 */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  const ip = clientIp(req);
  enforceRateLimit(`upload:${user.id}`, 30, 60 * 60 * 1000);

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_UPLOAD_BYTES() + 64 * 1024) throw new ApiError(413, 'file_too_large', `Files must be ${getEnv().MAX_UPLOAD_MB} MB or smaller.`);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'bad_request', 'Upload must be multipart form data with a "file" field.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'bad_request', 'No file was provided.');
  const projectRaw = form.get('projectId');
  const projectId = typeof projectRaw === 'string' && /^[0-9a-f-]{36}$/i.test(projectRaw) ? projectRaw : null;

  const name = safeFilename(file.name);
  const ext = allowedExtension(name);
  if (!ext) throw new ApiError(415, 'unsupported_file_type', 'Unsupported file type. Allowed: PDF, TXT, CSV, DOCX, PNG, JPG, JPEG.');
  if (file.size > MAX_UPLOAD_BYTES()) throw new ApiError(413, 'file_too_large', `Files must be ${getEnv().MAX_UPLOAD_MB} MB or smaller.`);

  const buf = Buffer.from(await file.arrayBuffer());
  const validated = validateUpload(name, buf);
  if (projectId && !(await getProjectInstructions(user.id, projectId))) throw new ApiError(404, 'not_found', 'Project was not found.');

  const storageKey = newStorageKey(ext);
  await putObject(storageKey, buf);
  const doc = await createDocumentRecord({
    userId: user.id,
    name,
    extension: ext,
    mimeType: validated.mimeType,
    kind: validated.kind,
    sizeBytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    storageKey,
    projectId,
  });

  try {
    if (validated.kind === 'image') {
      await saveDocumentContent(doc.id, user.id, [], { textChars: 0, summary: { type: 'image', bytes: buf.length } });
    } else {
      const text = await extractText(ext, buf);
      const chunks = chunkText(text);
      let summary: Record<string, unknown> = {};
      if (validated.kind === 'data') {
        const parsed = parseCsv(text);
        summary = summarizeRows(parsed.headers, parsed.rows, parsed.rows.length >= 50_000) as unknown as Record<string, unknown>;
      }
      await saveDocumentContent(doc.id, user.id, chunks, { textChars: text.length, summary });
      await embedChunks(doc.id, user.id, chunks).catch((err) => log('warn', 'documents.embed_skipped', { message: (err as Error).message }));
    }
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'We could not process this file.';
    await markDocumentError(doc.id, message);
    await writeAudit({ userId: user.id, category: 'data', action: 'document.processing_failed', target: doc.id, ip, metadata: { ext, reason: err instanceof ApiError ? err.code : 'internal' } });
    if (!(err instanceof ApiError)) log('error', 'documents.process_failed', { message: (err as Error)?.message?.slice(0, 200) });
  }

  await writeAudit({ userId: user.id, category: 'data', action: 'document.upload', target: doc.id, ip, metadata: { ext, bytes: buf.length } });
  const fresh = await getDocument(user.id, doc.id);
  return jsonOk({ document: toDocumentDto(fresh!) }, { status: 201 });
});

/** Embeds chunks with the configured embedding model when semantic search is enabled. */
async function embedChunks(documentId: string, userId: string, chunks: string[]): Promise<void> {
  if (!getEnv().NVIDIA_EMBEDDING_MODEL || chunks.length === 0) return;
  if (!(await hasVectorSupport())) return;
  const provider = getChatProvider();
  for (let i = 0; i < chunks.length; i += 16) {
    const batch = chunks.slice(i, i + 16);
    const vectors = await provider.embed(batch);
    for (let j = 0; j < batch.length; j++) {
      await query(`UPDATE document_chunks SET embedding = $4::vector WHERE document_id = $1 AND user_id = $2 AND chunk_index = $3`, [
        documentId,
        userId,
        i + j,
        toVectorLiteral(vectors[j]),
      ]);
    }
    await recordUsage({ userId, runId: null, model: getEnv().NVIDIA_EMBEDDING_MODEL!, kind: 'embedding', promptTokens: batch.join('').length / 4, completionTokens: 0 });
  }
}

