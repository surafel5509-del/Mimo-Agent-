import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAgent, type AgentRunInput } from '@/lib/agents/controller';
import type { AgentEvent } from '@/lib/agents/events';
import { setChatProviderForTests, getChatProvider } from '@/lib/ai/nvidia';
import type { ChatProvider, ChatRequest, StreamEvent } from '@/lib/ai/types';
import { getModelOptions, getEnv } from '@/lib/config';
import { createConversation } from '@/lib/services/conversations';
import { createDocumentRecord } from '@/lib/services/documents';
import { ensureDb, makeUser, resetDb } from './helpers';

/** Scripted model: each call returns the next scripted turn. Never touches the network. */
function scripted(turns: (n: number, req: ChatRequest) => StreamEvent[]): ChatProvider & { calls: number } {
  const p = {
    id: 'scripted',
    calls: 0,
    capabilities: () => ({ chat: true, toolCalling: true, vision: false, embeddings: false, streaming: true }),
    async *streamChat(req: ChatRequest) {
      const n = p.calls++;
      for (const ev of turns(n, req)) {
        if (req.signal?.aborted) return;
        yield ev;
      }
    },
    async embed() {
      return [];
    },
    async health() {
      return { ok: true, latencyMs: 0 };
    },
  };
  return p;
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

const finalOf = (events: AgentEvent[]) => events.find((e) => e.type === 'final') as Extract<AgentEvent, { type: 'final' }> | undefined;

describe('agent orchestration (scripted model, real database)', () => {
  let userId: string;
  let conversationId: string;
  const model = () => getModelOptions()[0];
  const baseInput = (over: Partial<AgentRunInput> = {}): AgentRunInput => ({
    userId,
    conversationId,
    projectId: null,
    mode: 'general',
    model: model(),
    userText: 'Hello, what can you do?',
    attachments: [],
    history: [],
    useMemory: false,
    timezone: 'Africa/Addis_Ababa',
    projectInstructions: null,
    signal: new AbortController().signal,
    ...over,
  });

  beforeAll(async () => {
    await ensureDb();
  });
  beforeEach(async () => {
    await resetDb();
    const user = await makeUser('agent@example.com');
    userId = user.id;
    conversationId = (await createConversation(userId, { mode: 'general' })).id;
  });
  afterAll(() => setChatProviderForTests(null));

  it('streams tokens and ends with a completed final answer', async () => {
    const provider = scripted(() => [
      { type: 'text_delta', text: 'Hello ' },
      { type: 'text_delta', text: 'there.' },
      { type: 'finish', reason: 'stop' },
    ]);
    setChatProviderForTests(provider);
    const events = await collect(runAgent(baseInput()));
    const tokens = events.filter((e) => e.type === 'token').map((e) => (e as { text: string }).text).join('');
    expect(tokens).toBe('Hello there.');
    expect(events[0].type).toBe('run');
    const final = finalOf(events);
    expect(final?.metadata.status).toBe('completed');
    expect(final?.text).toContain('Hello');
  });

  it('executes a native tool call and feeds the result back to the model', async () => {
    const seen: ChatRequest[] = [];
    const provider = scripted((n, req) => {
      seen.push(req);
      if (n === 0) {
        return [{ type: 'tool_call', id: 'call_1', name: 'calculator', arguments: JSON.stringify({ operation: 'evaluate', expression: '2 + 3 * 4' }) }, { type: 'finish', reason: 'tool_calls' }];
      }
      return [{ type: 'text_delta', text: 'The result is 14.' }, { type: 'finish', reason: 'stop' }];
    });
    setChatProviderForTests(provider);
    const events = await collect(runAgent(baseInput({ userText: 'What is 2 + 3 * 4?' })));
    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }> | undefined;
    expect(toolEnd?.name).toBe('calculator');
    expect(toolEnd?.status).toBe('ok');
    expect(finalOf(events)?.metadata.toolsUsed).toContain('calculator');
    // The second model call must include the tool result, so the model can use it.
    const second = JSON.stringify(seen[1]?.messages ?? []);
    expect(second).toContain('14');
  });

  it('refuses a tool that the selected mode does not permit', async () => {
    const provider = scripted((n) =>
      n === 0
        ? [{ type: 'tool_call', id: 'c1', name: 'web_search', arguments: JSON.stringify({ query: 'latest news' }) }, { type: 'finish', reason: 'tool_calls' }]
        : [{ type: 'text_delta', text: 'I cannot search in this mode.' }, { type: 'finish', reason: 'stop' }],
    );
    setChatProviderForTests(provider);
    const events = await collect(runAgent(baseInput({ mode: 'writing', userText: 'Search the news' })));
    const toolEnd = events.find((e) => e.type === 'tool_end') as Extract<AgentEvent, { type: 'tool_end' }> | undefined;
    expect(toolEnd).toBeDefined();
    expect(toolEnd?.status).not.toBe('ok');
    expect(finalOf(events)?.metadata.sources).toHaveLength(0);
  });

  it('stops a model that loops on the same tool call (loop prevention and step bound)', async () => {
    const provider = scripted(() => [
      { type: 'tool_call', id: `c${Math.random()}`, name: 'calculator', arguments: JSON.stringify({ operation: 'evaluate', expression: '1+1' }) },
      { type: 'finish', reason: 'tool_calls' },
    ]);
    setChatProviderForTests(provider);
    const events = await collect(runAgent(baseInput({ userText: 'keep calculating' })));
    expect(provider.calls).toBeLessThanOrEqual(getEnv().AGENT_MAX_STEPS + 2);
    const final = finalOf(events);
    expect(final).toBeDefined();
    expect(['step_limit', 'completed', 'failed']).toContain(final!.metadata.status);
  });

  it('honours cancellation and reports the run as cancelled', async () => {
    const controller = new AbortController();
    const provider = scripted((n) => {
      if (n === 0) controller.abort();
      return [{ type: 'text_delta', text: 'partial' }, { type: 'finish', reason: 'stop' }];
    });
    setChatProviderForTests(provider);
    const events = await collect(runAgent(baseInput({ signal: controller.signal })));
    const final = finalOf(events);
    expect(final?.metadata.status).toBe('cancelled');
  });

  it('refuses a model that is not on the server allow-list', async () => {
    setChatProviderForTests(scripted(() => []));
    const events = await collect(runAgent(baseInput({ model: 'not/allowed-model' })));
    expect(events.some((e) => e.type === 'error' && (e as { code: string }).code === 'model_not_allowed')).toBe(true);
  });

  it('retrieves attached documents as untrusted data inside the prompt', async () => {
    const doc = await createDocumentRecord({
      userId,
      name: 'notes.txt',
      extension: 'txt',
      mimeType: 'text/plain',
      kind: 'document',
      sizeBytes: 20,
      sha256: 'b'.repeat(64),
      storageKey: 'x/notes.txt',
    });
    expect(doc.status).toBeDefined();
    const seen: ChatRequest[] = [];
    setChatProviderForTests(
      scripted((_n, req) => {
        seen.push(req);
        return [{ type: 'text_delta', text: 'ok' }, { type: 'finish', reason: 'stop' }];
      }),
    );
    await collect(runAgent(baseInput({ attachments: [doc] })));
    expect(getChatProvider()).toBeDefined();
    const system = seen[0].messages.find((m) => m.role === 'system');
    expect(typeof system?.content === 'string' ? system.content : '').toMatch(/untrusted|data/i);
  });
});
