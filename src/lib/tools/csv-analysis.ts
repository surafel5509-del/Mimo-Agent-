import Papa from 'papaparse';
import { ToolError } from './types';

export type ColumnStats = {
  name: string;
  type: 'number' | 'text' | 'empty';
  missing: number;
  count?: number;
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
  stdev?: number;
  sum?: number;
  topValues?: { value: string; count: number }[];
  distinct?: number;
};

export type CsvSummary = {
  rowCount: number;
  columnCount: number;
  columns: ColumnStats[];
  truncated: boolean;
};

const MAX_ROWS = 50_000;

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h, i) => (h.trim() || `column_${i + 1}`).slice(0, 80),
  });
  if (parsed.errors.some((e) => e.type === 'Delimiter' && e.code === 'UndetectableDelimiter') && !parsed.meta.fields?.length) {
    throw new ToolError('invalid_input', 'The CSV file could not be parsed.');
  }
  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) throw new ToolError('invalid_input', 'The CSV file has no header row.');
  return { headers, rows: parsed.data.slice(0, MAX_ROWS) };
}

export function summarizeRows(headers: string[], rows: Record<string, string>[], truncated = false): CsvSummary {
  const columns = headers.map((name) => columnStats(name, rows));
  return { rowCount: rows.length, columnCount: headers.length, columns, truncated };
}

export function columnStats(name: string, rows: Record<string, string>[]): ColumnStats {
  const values = rows.map((r) => (r[name] ?? '').trim());
  const present = values.filter((v) => v !== '');
  const missing = values.length - present.length;
  if (present.length === 0) return { name, type: 'empty', missing };

  const nums = present.map((v) => Number(v.replace(/,/g, '')));
  const numericCount = nums.filter((n) => Number.isFinite(n)).length;
  if (numericCount / present.length >= 0.9) {
    const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    const sum = xs.reduce((a, b) => a + b, 0);
    const mean = sum / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    const mid = Math.floor(xs.length / 2);
    const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
    return {
      name,
      type: 'number',
      missing: missing + (present.length - numericCount),
      count: xs.length,
      sum: round(sum),
      mean: round(mean),
      median: round(median),
      min: xs[0],
      max: xs[xs.length - 1],
      stdev: round(Math.sqrt(variance)),
    };
  }

  const freq = new Map<string, number>();
  for (const v of present) freq.set(v, (freq.get(v) ?? 0) + 1);
  const topValues = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value: value.slice(0, 80), count }));
  return { name, type: 'text', missing, distinct: freq.size, topValues };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Renders a simple, dependency-free SVG bar or line chart. All labels are escaped. */
export function renderChartSvg(opts: {
  type: 'bar' | 'line';
  title: string;
  labels: string[];
  values: number[];
}): string {
  const W = 640;
  const H = 360;
  const P = { l: 56, r: 16, t: 40, b: 64 };
  const n = Math.max(1, opts.values.length);
  const max = Math.max(...opts.values, 0);
  const min = Math.min(...opts.values, 0);
  const span = max - min || 1;
  const innerW = W - P.l - P.r;
  const innerH = H - P.t - P.b;
  const y = (v: number) => P.t + innerH - ((v - min) / span) * innerH;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

  let body = '';
  if (opts.type === 'bar') {
    const bw = innerW / n;
    opts.values.forEach((v, i) => {
      const yy = y(Math.max(v, 0));
      const h = Math.abs(y(v) - y(0));
      body += `<rect x="${(P.l + i * bw + bw * 0.15).toFixed(1)}" y="${yy.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" fill="#8b5cf6"><title>${esc(opts.labels[i] ?? '')}: ${v}</title></rect>`;
    });
  } else {
    const pts = opts.values.map((v, i) => `${(P.l + (i / Math.max(1, n - 1)) * innerW).toFixed(1)},${y(v).toFixed(1)}`);
    body += `<polyline fill="none" stroke="#8b5cf6" stroke-width="2" points="${pts.join(' ')}"/>`;
  }
  const labelEvery = Math.ceil(n / 10);
  opts.labels.forEach((l, i) => {
    if (i % labelEvery !== 0) return;
    const x = P.l + (opts.type === 'bar' ? (i + 0.5) * (innerW / n) : (i / Math.max(1, n - 1)) * innerW);
    body += `<text x="${x.toFixed(1)}" y="${H - P.b + 16}" font-size="10" fill="#9ca3af" text-anchor="middle">${esc(l.slice(0, 14))}</text>`;
  });
  body += `<line x1="${P.l}" y1="${y(0)}" x2="${W - P.r}" y2="${y(0)}" stroke="#4b5563"/>`;
  body += `<text x="${P.l - 6}" y="${P.t + 4}" font-size="10" fill="#9ca3af" text-anchor="end">${round(max)}</text>`;
  body += `<text x="${P.l - 6}" y="${P.t + innerH}" font-size="10" fill="#9ca3af" text-anchor="end">${round(min)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opts.title)}"><rect width="${W}" height="${H}" fill="#111827" rx="12"/><text x="${P.l}" y="24" font-size="14" fill="#e5e7eb" font-family="sans-serif">${esc(opts.title)}</text>${body}</svg>`;
}
