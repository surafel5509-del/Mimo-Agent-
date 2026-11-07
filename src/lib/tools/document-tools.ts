import { z } from 'zod';
import type { ToolDefinition, ToolSource } from './types';
import { ToolError } from './types';
import { getDocument, getDocumentChunks, searchChunks } from '@/lib/services/documents';
import { getObject } from '@/lib/storage/object-store';
import { parseCsv, summarizeRows, renderChartSvg, columnStats } from './csv-analysis';
import { complete } from '@/lib/ai/complete';
import { getChatProvider } from '@/lib/ai/nvidia';
import { getEnv } from '@/lib/config';
import { IMAGE_MIME_BY_EXT } from '@/lib/storage/file-validation';
import { ProviderError } from '@/lib/ai/types';

const readerSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('search'),
    documentId: z.uuid(),
    query: z.string().min(2).max(300),
  }),
  z.object({
    action: z.literal('excerpt'),
    documentId: z.uuid(),
    offset: z.number().int().min(0).max(10000).default(0),
  }),
]);

/** Retrieves relevant excerpts (RAG). Document text is returned as untrusted data. */
export const documentReaderTool: ToolDefinition<typeof readerSchema> = {
  name: 'document_reader',
  title: 'Document reader',
  description:
    'Read the user\'s uploaded documents. action=search (documentId + query) returns the most relevant chunks; action=excerpt (documentId, offset) returns sequential chunks for summaries. Cite chunk numbers in answers.',
  permission: 'read',
  inputSchema: readerSchema,
  timeoutMs: 8000,
  requiresApproval: () => false,
  async execute(input, ctx) {
    const doc = await getDocument(ctx.userId, input.documentId);
    if (!doc) throw new ToolError('not_found', 'That document was not found.');
    if (doc.status !== 'ready') throw new ToolError('failed', `The document is not ready (status: ${doc.status}).`);
    const sources: ToolSource[] = [];
    if (input.action === 'search') {
      const hits = await searchChunks(ctx.userId, input.query, { documentIds: [doc.id], limit: 5 });
      if (hits.length === 0) {
        // Fall back to the opening chunks so the model still has context for summaries.
        const first = await getDocumentChunks(ctx.userId, doc.id, { limit: 3 });
        return {
          data: { document: doc.original_name, matches: 0, chunks: first.map((c) => ({ index: c.chunkIndex, text: c.content })) },
          summary: `No direct match; returned the opening of ${doc.original_name}`,
          sources: [{ title: doc.original_name, url: `document:${doc.id}`, kind: 'document' }],
        };
      }
      sources.push({ title: doc.original_name, url: `document:${doc.id}`, kind: 'document' });
      return {
        data: { document: doc.original_name, matches: hits.length, chunks: hits.map((h) => ({ index: h.chunkIndex, text: h.content })) },
        summary: `${hits.length} relevant excerpt(s) from ${doc.original_name}`,
        sources,
      };
    }
    const chunks = await getDocumentChunks(ctx.userId, doc.id, { offset: input.offset, limit: 6 });
    sources.push({ title: doc.original_name, url: `document:${doc.id}`, kind: 'document' });
    return {
      data: { document: doc.original_name, chunks: chunks.map((c) => ({ index: c.chunkIndex, text: c.content })) },
      summary: `Read ${chunks.length} section(s) of ${doc.original_name}`,
      sources,
    };
  },
};

const analysisSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('summary'), documentId: z.uuid() }),
  z.object({ operation: z.literal('column'), documentId: z.uuid(), column: z.string().min(1).max(80) }),
  z.object({
    operation: z.literal('chart'),
    documentId: z.uuid(),
    chartType: z.enum(['bar', 'line']).default('bar'),
    xColumn: z.string().min(1).max(80),
    yColumn: z.string().min(1).max(80),
    aggregate: z.enum(['sum', 'mean', 'count']).default('sum'),
  }),
]);

async function loadCsv(userId: string, documentId: string) {
  const doc = await getDocument(userId, documentId);
  if (!doc) throw new ToolError('not_found', 'That dataset was not found.');
  if (doc.kind !== 'data') throw new ToolError('invalid_input', 'Data analysis works on CSV files only.');
  const buf = await getObject(doc.storage_key);
  const parsed = parseCsv(buf.toString('utf8'));
  return { doc, ...parsed };
}

/** Data analysis over CSV uploads: summaries, column statistics and SVG charts. */
export const dataAnalysisTool: ToolDefinition<typeof analysisSchema> = {
  name: 'data_analysis',
  title: 'Data analysis',
  description:
    'Analyse an uploaded CSV. operation=summary (row/column counts, per-column stats), operation=column (stats for one column), operation=chart (bar or line chart of yColumn aggregated by xColumn; sum|mean|count).',
  permission: 'read',
  inputSchema: analysisSchema,
  timeoutMs: 15000,
  requiresApproval: () => false,
  async execute(input, ctx) {
    const { doc, headers, rows } = await loadCsv(ctx.userId, input.documentId);
    if (input.operation === 'summary') {
      const summary = summarizeRows(headers, rows, rows.length >= 50_000);
      return { data: { document: doc.original_name, ...summary }, summary: `${summary.rowCount} rows × ${summary.columnCount} columns`, sources: [{ title: doc.original_name, url: `document:${doc.id}`, kind: 'document' }] };
    }
    if (input.operation === 'column') {
      if (!headers.includes(input.column)) throw new ToolError('invalid_input', `Column "${input.column}" does not exist.`);
      const stats = columnStats(input.column, rows);
      return { data: { column: stats }, summary: `Statistics for ${input.column}` };
    }
    // chart
    if (!headers.includes(input.xColumn) || !headers.includes(input.yColumn)) {
      throw new ToolError('invalid_input', 'Both xColumn and yColumn must exist in the dataset.');
    }
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      const key = (r[input.xColumn] ?? '').trim() || '(blank)';
      const y = Number((r[input.yColumn] ?? '').replace(/,/g, ''));
      if (!groups.has(key)) groups.set(key, []);
      if (input.aggregate === 'count') groups.get(key)!.push(1);
      else if (Number.isFinite(y)) groups.get(key)!.push(y);
    }
    const labels: string[] = [];
    const values: number[] = [];
    for (const [k, vs] of groups) {
      labels.push(k);
      const v =
        input.aggregate === 'count'
          ? vs.length
          : input.aggregate === 'mean'
            ? vs.reduce((a, b) => a + b, 0) / Math.max(1, vs.length)
            : vs.reduce((a, b) => a + b, 0);
      values.push(Math.round(v * 10000) / 10000);
    }
    const capped = labels.slice(0, 60);
    const svg = renderChartSvg({
      type: input.chartType,
      title: `${input.aggregate}(${input.yColumn}) by ${input.xColumn}`,
      labels: capped,
      values: values.slice(0, 60),
    });
    return {
      data: { labels: capped, values: values.slice(0, 60), groups: labels.length, aggregate: input.aggregate },
      summary: `Chart: ${input.aggregate} of ${input.yColumn} by ${input.xColumn}`,
      artifacts: [{ type: 'chart', title: `${input.aggregate}(${input.yColumn}) by ${input.xColumn}`, svg }],
    };
  },
};

const imageSchema = z.object({
  documentId: z.uuid(),
  question: z.string().min(2).max(1000).default('Describe this image in detail.'),
});

/** Image analysis via a configured vision model. Returns a description the model must ground on. */
export const imageAnalysisTool: ToolDefinition<typeof imageSchema> = {
  name: 'image_analysis',
  title: 'Image analysis',
  description:
    'Analyse an uploaded PNG/JPG using the configured vision model. Returns a grounded description for a question. Fails clearly if no vision model is configured.',
  permission: 'network',
  inputSchema: imageSchema,
  timeoutMs: 45000,
  requiresApproval: () => false,
  async execute(input, ctx) {
    const env = getEnv();
    if (!env.NVIDIA_VISION_MODEL) {
      throw new ToolError('not_configured', 'Image analysis is not configured. Set NVIDIA_VISION_MODEL to a vision-capable model.');
    }
    const doc = await getDocument(ctx.userId, input.documentId);
    if (!doc) throw new ToolError('not_found', 'That image was not found.');
    if (doc.kind !== 'image') throw new ToolError('invalid_input', 'That file is not an image.');
    const provider = getChatProvider();
    if (!provider.capabilities(env.NVIDIA_VISION_MODEL).vision) throw new ToolError('not_configured', 'Vision is not enabled for the configured model.');
    const buf = await getObject(doc.storage_key);
    const mime = IMAGE_MIME_BY_EXT[doc.extension] ?? 'image/png';
    try {
      const out = await complete({
        userId: ctx.userId,
        runId: ctx.runId,
        kind: 'vision',
        request: {
          model: env.NVIDIA_VISION_MODEL,
          temperature: 0.2,
          maxTokens: 800,
          timeoutMs: 40000,
          signal: ctx.signal,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `${input.question}\nOnly describe what is visible. Say when something is unclear.` },
                { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } },
              ],
            },
          ],
        },
      });
      return { data: { description: out.text.slice(0, 4000), document: doc.original_name }, summary: `Analysed ${doc.original_name}` };
    } catch (err) {
      if (err instanceof ProviderError) throw new ToolError('failed', err.message);
      throw err;
    }
  },
};
