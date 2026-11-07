import { describe, expect, it } from 'vitest';
import { chatSchema, registerSchema } from '@/lib/validation/schemas';
import { parseCsv, summarizeRows, columnStats } from '@/lib/tools/csv-analysis';
import { chunkText } from '@/lib/memory/chunking';

describe('request validation', () => {
  it('rejects an empty chat message', () => {
    expect(chatSchema.safeParse({ message: '   ', mode: 'general' }).success).toBe(false);
  });

  it('rejects unknown agent modes', () => {
    expect(chatSchema.safeParse({ message: 'hi', mode: 'root-shell' }).success).toBe(false);
  });

  it('accepts a valid chat turn', () => {
    expect(chatSchema.safeParse({ message: 'hi', mode: 'coding' }).success).toBe(true);
  });

  it('validates registration input', () => {
    expect(registerSchema.safeParse({ email: 'not-an-email', password: 'GoodPassword1' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'user@example.com', password: 'GoodPassword1' }).success).toBe(true);
  });
});

describe('csv analysis', () => {
  const csv = 'region,revenue\nAddis,100\nAddis,50\nDire Dawa,25\n';

  it('parses headers and rows', () => {
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(['region', 'revenue']);
    expect(rows).toHaveLength(3);
  });

  it('computes numeric column statistics', () => {
    const { rows } = parseCsv(csv);
    const stats = columnStats('revenue', rows);
    expect(stats.type).toBe('number');
    expect(stats.sum).toBe(175);
    expect(stats.max).toBe(100);
  });

  it('summarises a table', () => {
    const { headers, rows } = parseCsv(csv);
    const summary = summarizeRows(headers, rows);
    expect(summary.rowCount).toBe(3);
  });
});

describe('chunking', () => {
  it('splits long text into bounded chunks', () => {
    const chunks = chunkText('word '.repeat(2000), 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(600);
  });

  it('returns a single chunk for short text', () => {
    expect(chunkText('short text')).toHaveLength(1);
  });
});
