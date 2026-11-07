/** LangSearch client verified against a local mock of POST /v1/web-search (not the live API). */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/config';
import { searchWeb } from '@/lib/tools/web-search';

let server: http.Server;
let seen: { auth?: string; url?: string; body?: any }[] = [];
let mode: 'ok' | 'rate' | 'error' = 'ok';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, url: req.url, body: raw ? JSON.parse(raw) : undefined });
      if (mode === 'rate') return void res.writeHead(429).end();
      if (mode === 'error') return void res.writeHead(500).end();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: {
            webPages: {
              value: [
                { name: 'Result one', url: 'https://one.example/a', snippet: '<b>First</b> snippet' },
                { name: 'Bad', url: 'javascript:alert(1)', snippet: 'x' },
                { name: 'Result two', url: 'https://two.example/b', snippet: 'Second' },
              ],
            },
          },
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.LANGSEARCH_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.LANGSEARCH_API_KEY = 'ls-test-key';
  process.env.WEB_SEARCH_PROVIDER = 'langsearch';
  resetEnvCache();
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  process.env.WEB_SEARCH_PROVIDER = 'none';
  delete process.env.LANGSEARCH_API_KEY;
  resetEnvCache();
});

beforeEach(() => {
  seen = [];
  mode = 'ok';
  resetEnvCache();
});

describe('LangSearch web search client (mock server)', () => {
  it('posts the documented body with bearer auth and parses safe results only', async () => {
    const results = await searchWeb('ethiopia gdp 2025', 5);
    expect(seen[0].url).toBe('/v1/web-search');
    expect(seen[0].auth).toBe('Bearer ls-test-key');
    expect(seen[0].body).toEqual({ query: 'ethiopia gdp 2025', count: 5, contents: { text: true }, freshness: 'noLimit' });
    expect(results.map((r) => r.url)).toEqual(['https://one.example/a', 'https://two.example/b']);
    expect(results[0].snippet).toBe('First snippet');
  });

  it('reports a provider rate limit as a tool failure', async () => {
    mode = 'rate';
    await expect(searchWeb('q', 3)).rejects.toThrow(/rate limit/);
  });

  it('reports a provider error without leaking the key', async () => {
    mode = 'error';
    try {
      await searchWeb('q', 3);
      throw new Error('expected failure');
    } catch (e) {
      expect(String((e as Error).message)).toMatch(/HTTP 500/);
      expect(String((e as Error).message)).not.toContain('ls-test-key');
    }
  });
});
