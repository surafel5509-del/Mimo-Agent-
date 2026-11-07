/**
 * Exercises the REAL NVIDIA/OpenAI-compatible HTTP client (NvidiaProvider) against a local mock
 * server. This verifies request shape, SSE parsing, tool-call assembly, retries, and error mapping.
 * It does NOT prove that integrate.api.nvidia.com accepts the request; that needs a live key.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NvidiaProvider, setChatProviderForTests } from '@/lib/ai/nvidia';
import { resetEnvCache } from '@/lib/config';
import { runAgent } from '@/lib/agents/controller';
import { createConversation } from '@/lib/services/conversations';
import type { ChatRequest, StreamEvent } from '@/lib/ai/types';
import { ensureDb, makeUser, resetDb } from './helpers';

const KEY = 'test-key-not-real-123';
type Seen = { auth?: string; body?: any };
let server: http.Server;
let base = '';
let seen: Seen[] = [];
let rateLimitOnce = false;

function sse(res: http.ServerResponse, frames: unknown[]) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const f of frames) res.write(`data: ${JSON.stringify(f)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ auth: req.headers.authorization, body });
      if (req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      if (req.headers.authorization !== `Bearer ${KEY}`) {
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'invalid key' } }));
        return;
      }
      const last = String(body.messages?.at(-1)?.content ?? '');
      if (last.includes('RATELIMIT') && rateLimitOnce) {
        rateLimitOnce = false;
        res.writeHead(429).end('slow down');
        return;
      }
      const hasToolResult = body.messages?.some((m: any) => m.role === 'tool');
      if (last.includes('TOOLCALL') && !hasToolResult) {
        // Tool arguments arrive in fragments across several chunks, as real providers stream them.
        sse(res, [
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'calculator', arguments: '{"operation":"evaluate",' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"expression":"6*7"}' } }] } }] },
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ]);
        return;
      }
      if (hasToolResult) {
        sse(res, [
          { choices: [{ delta: { content: 'The answer is ' } }] },
          { choices: [{ delta: { content: '42.' } }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
          { choices: [], usage: { prompt_tokens: 120, completion_tokens: 7 } },
        ]);
        return;
      }
      sse(res, [
        { choices: [{ delta: { content: 'Hello ' } }] },
        { choices: [{ delta: { content: 'from the mock.' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
        { choices: [], usage: { prompt_tokens: 10, completion_tokens: 4 } },
      ]);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.NVIDIA_BASE_URL = base;
  process.env.NVIDIA_API_KEY = KEY;
  process.env.NVIDIA_MAX_RETRIES = '2';
  resetEnvCache();
  await ensureDb();
});

afterAll(async () => {
  setChatProviderForTests(null);
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  seen = [];
  rateLimitOnce = false;
  resetEnvCache();
});

const req = (text: string, extra: Partial<ChatRequest> = {}): ChatRequest => ({
  model: 'meta/llama-3.1-70b-instruct',
  messages: [{ role: 'user', content: text }],
  ...extra,
});

async function collect(gen: AsyncGenerator<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('NVIDIA HTTP client (mock server)', () => {
  it('sends a bearer-authenticated streaming request and parses text + usage', async () => {
    const events = await collect(new NvidiaProvider().streamChat(req('hi')));
    const text = events.filter((e) => e.type === 'text_delta').map((e: any) => e.text).join('');
    expect(text).toBe('Hello from the mock.');
    expect(events).toContainEqual({ type: 'usage', promptTokens: 10, completionTokens: 4 });
    expect(seen[0].auth).toBe(`Bearer ${KEY}`);
    expect(seen[0].body.stream).toBe(true);
    expect(seen[0].body.model).toBe('meta/llama-3.1-70b-instruct');
  });

  it('assembles tool-call arguments streamed in fragments', async () => {
    const events = await collect(new NvidiaProvider().streamChat(req('TOOLCALL please', { tools: [{ type: 'function', function: { name: 'calculator', description: 'calc', parameters: { type: 'object' } } }] })));
    const call = events.find((e) => e.type === 'tool_call') as any;
    expect(call).toBeDefined();
    expect(call.name).toBe('calculator');
    expect(JSON.parse(call.arguments)).toEqual({ operation: 'evaluate', expression: '6*7' });
    expect(seen[0].body.tools?.[0]?.function?.name).toBe('calculator');
  });

  it('retries a 429 once and then succeeds', async () => {
    rateLimitOnce = true;
    const events = await collect(new NvidiaProvider().streamChat(req('RATELIMIT then answer')));
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(seen.length).toBe(2);
  });

  it('maps a rejected key to an auth error without echoing the key', async () => {
    process.env.NVIDIA_API_KEY = 'wrong-key';
    resetEnvCache();
    let caught: any = null;
    try {
      await collect(new NvidiaProvider().streamChat(req('hi')));
    } catch (e) {
      caught = e;
    } finally {
      process.env.NVIDIA_API_KEY = KEY;
      resetEnvCache();
    }
    expect(caught?.code).toBe('auth');
    expect(String(caught?.message)).not.toContain('wrong-key');
  });
});

describe('agent run through the real NVIDIA client (mock server)', () => {
  let userId: string;
  let conversationId: string;
  beforeEach(async () => {
    await resetDb();
    userId = (await makeUser('nv-agent@example.com')).id;
    conversationId = (await createConversation(userId, { mode: 'general' })).id;
    setChatProviderForTests(new NvidiaProvider());
  });

  it('executes a native tool call and produces the final answer', async () => {
    const events: any[] = [];
    for await (const ev of runAgent({
      userId,
      conversationId,
      projectId: null,
      mode: 'general',
      model: 'meta/llama-3.1-70b-instruct',
      userText: 'TOOLCALL what is six times seven?',
      attachments: [],
      history: [],
      useMemory: false,
      timezone: 'Africa/Addis_Ababa',
      projectInstructions: null,
      signal: new AbortController().signal,
    })) events.push(ev);
    const toolEnd = events.find((e) => e.type === 'tool_end');
    expect(toolEnd?.name).toBe('calculator');
    expect(toolEnd?.status).toBe('ok');
    const final = events.find((e) => e.type === 'final');
    expect(final.text).toContain('42');
    expect(final.metadata.status).toBe('completed');
    expect(final.metadata.toolsUsed).toContain('calculator');
    // The tool result was sent back to the model in the second request.
    expect(JSON.stringify(seen[1].body.messages)).toContain('42');
  });
});
