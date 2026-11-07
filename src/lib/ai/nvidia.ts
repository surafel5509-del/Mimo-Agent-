import 'server-only';
import { getEnv } from '@/lib/config';
import { log } from '@/lib/logging/logger';
import { parseSse } from './sse';
import {
  ProviderError,
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type ContentPart,
  type ModelCapabilities,
  type StreamEvent,
} from './types';

const MAX_TOTAL_CHARS = 200_000;
const ROLES = new Set(['system', 'user', 'assistant', 'tool']);

/** Validates a message list before it is sent upstream. Throws ProviderError on invalid input. */
export function validateMessages(messages: ChatMessage[], opts: { allowImages: boolean }): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ProviderError('bad_request', 'At least one message is required.');
  }
  let total = 0;
  for (const m of messages) {
    if (!ROLES.has(m.role)) throw new ProviderError('bad_request', `Unsupported message role: ${String(m.role)}`);
    if (typeof m.content === 'string') {
      total += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const part of m.content as ContentPart[]) {
        if (part.type === 'text') total += part.text.length;
        else if (part.type === 'image_url') {
          if (!opts.allowImages) {
            throw new ProviderError('unsupported', 'The selected model does not accept image input.');
          }
          if (!/^data:image\/(png|jpeg|jpg);base64,/.test(part.image_url.url)) {
            throw new ProviderError('bad_request', 'Image input must be a PNG or JPEG data URL.');
          }
        } else {
          throw new ProviderError('bad_request', 'Unsupported content part.');
        }
      }
    } else if (m.content !== null) {
      throw new ProviderError('bad_request', 'Invalid message content.');
    }
  }
  if (total > MAX_TOTAL_CHARS) throw new ProviderError('bad_request', 'The conversation context is too large.');
}

export class NvidiaProvider implements ChatProvider {
  readonly id = 'nvidia-nim';

  capabilities(model: string): ModelCapabilities {
    const env = getEnv();
    const toolCalling: boolean | 'unknown' =
      env.NVIDIA_TOOL_CALLING === 'native' ? true : env.NVIDIA_TOOL_CALLING === 'json' ? false : 'unknown';
    return {
      chat: true,
      toolCalling,
      // Vision is only claimed for the model explicitly configured as a vision model.
      vision: Boolean(env.NVIDIA_VISION_MODEL) && model === env.NVIDIA_VISION_MODEL,
      embeddings: Boolean(env.NVIDIA_EMBEDDING_MODEL),
      streaming: true,
    };
  }

  private headers(): Record<string, string> {
    const key = getEnv().NVIDIA_API_KEY;
    if (!key) throw new ProviderError('not_configured', 'NVIDIA_API_KEY is not configured on the server.');
    return {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
  }

  private url(path: string): string {
    return `${getEnv().NVIDIA_BASE_URL.replace(/\/+$/, '')}${path}`;
  }

  /**
   * Streams a chat completion. Retries transient failures (429/5xx) before the first byte is
   * streamed. Tool-call fragments are accumulated and emitted whole when the stream finishes.
   */
  async *streamChat(req: ChatRequest): AsyncGenerator<StreamEvent> {
    const env = getEnv();
    const allowImages = this.capabilities(req.model).vision;
    validateMessages(req.messages, { allowImages });

    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens ?? 1024,
    };
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools;
      body.tool_choice = 'auto';
    }

    const started = Date.now();
    const { response, release } = await this.fetchWithRetry(body, req);
    if (!response.body) {
      release();
      throw new ProviderError('invalid_response', 'Empty response from model provider.');
    }

    const toolAcc = new Map<number, { id: string; name: string; args: string }>();
    let finishReason: string | null = null;
    let usageEmitted = false;
    const idleTimeout = req.timeoutMs ?? env.NVIDIA_TIMEOUT_MS;

    const stream = parseSse(response.body);
    try {
      while (true) {
        const next = await withIdleTimeout(stream.next(), idleTimeout, req.signal);
        if (next.done) break;
        const chunk = next.value as Record<string, any>;
        if (chunk.error) {
          throw new ProviderError('unavailable', `Model provider error: ${String(chunk.error?.message ?? 'unknown').slice(0, 200)}`);
        }
        if (chunk.usage && typeof chunk.usage.prompt_tokens === 'number') {
          usageEmitted = true;
          yield {
            type: 'usage',
            promptTokens: Number(chunk.usage.prompt_tokens) || 0,
            completionTokens: Number(chunk.usage.completion_tokens) || 0,
          };
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          yield { type: 'text_delta', text: delta.content };
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const index = Number(tc.index ?? 0);
            const entry = toolAcc.get(index) ?? { id: '', name: '', args: '' };
            if (tc.id) entry.id = String(tc.id);
            if (tc.function?.name) entry.name += String(tc.function.name);
            if (typeof tc.function?.arguments === 'string') entry.args += tc.function.arguments;
            toolAcc.set(index, entry);
          }
        }
        if (choice.finish_reason) finishReason = String(choice.finish_reason);
      }
    } catch (err) {
      if (req.signal?.aborted) throw new ProviderError('aborted', 'Generation was stopped.');
      if (err instanceof ProviderError) throw err;
      throw new ProviderError('unavailable', 'The model stream was interrupted.');
    } finally {
      await stream.return(undefined).catch(() => undefined);
      release();
    }

    for (const [index, tc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
      if (!tc.name) continue;
      yield { type: 'tool_call', id: tc.id || `call_${index}`, name: tc.name, arguments: tc.args || '{}' };
    }
    if (!usageEmitted) yield { type: 'usage', promptTokens: 0, completionTokens: 0 };
    yield { type: 'finish', reason: finishReason };
    log('info', 'ai.chat.completed', { model: req.model, latencyMs: Date.now() - started, toolCalls: toolAcc.size });
  }

  /**
   * Opens the upstream stream. The returned `release` must be called when streaming ends; it
   * aborts the upstream request if it is still open (client disconnect / Stop).
   */
  private async fetchWithRetry(
    body: Record<string, unknown>,
    req: ChatRequest,
  ): Promise<{ response: Response; release: () => void }> {
    const env = getEnv();
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      req.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? env.NVIDIA_TIMEOUT_MS);
      const release = () => {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
        if (!controller.signal.aborted) controller.abort();
      };
      try {
        const res = await fetch(this.url('/chat/completions'), {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.ok) {
          clearTimeout(timer); // stream timing is governed by the idle timeout
          return { response: res, release };
        }
        release();
        const status = res.status;
        const text = await res.text().catch(() => '');
        const detail = safeProviderDetail(text);
        if (status === 401 || status === 403) throw new ProviderError('auth', 'The model provider rejected the API key.', status);
        if (status === 429 && attempt < env.NVIDIA_MAX_RETRIES) {
          attempt += 1;
          await sleep(retryDelay(res, attempt));
          continue;
        }
        if (status === 429) throw new ProviderError('rate_limited', 'The model provider is rate limiting requests. Try again shortly.', status);
        if (status >= 500 && attempt < env.NVIDIA_MAX_RETRIES) {
          attempt += 1;
          await sleep(retryDelay(res, attempt));
          continue;
        }
        if (status === 400 || status === 404 || status === 422) {
          throw new ProviderError('bad_request', `The model provider rejected the request${detail ? `: ${detail}` : ''}.`, status);
        }
        throw new ProviderError('unavailable', 'The model provider is temporarily unavailable.', status);
      } catch (err) {
        release();
        if (err instanceof ProviderError) throw err;
        if (req.signal?.aborted) throw new ProviderError('aborted', 'Generation was stopped.');
        if ((err as Error).name === 'AbortError') throw new ProviderError('timeout', 'The model provider did not respond in time.');
        throw new ProviderError('unavailable', 'Could not reach the model provider.');
      }
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const env = getEnv();
    if (!env.NVIDIA_EMBEDDING_MODEL) throw new ProviderError('not_configured', 'No embedding model is configured.');
    const res = await fetch(this.url('/embeddings'), {
      method: 'POST',
      headers: { ...this.headers(), Accept: 'application/json' },
      body: JSON.stringify({ model: env.NVIDIA_EMBEDDING_MODEL, input: texts, input_type: 'passage', encoding_format: 'float', truncate: 'END' }),
      signal: AbortSignal.timeout(env.NVIDIA_TIMEOUT_MS),
    });
    if (!res.ok) throw new ProviderError('unavailable', `Embedding request failed (HTTP ${res.status}).`, res.status);
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    const vectors = (json.data ?? []).map((d) => d.embedding);
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== env.MEMORY_EMBEDDING_DIM)) {
      throw new ProviderError('invalid_response', 'Embedding dimension does not match MEMORY_EMBEDDING_DIM.');
    }
    return vectors;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const started = Date.now();
    try {
      const res = await fetch(this.url('/models'), {
        headers: { Authorization: `Bearer ${getEnv().NVIDIA_API_KEY ?? ''}` },
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - started;
      if (res.ok) return { ok: true, latencyMs };
      return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, error: (err as Error).name === 'TimeoutError' ? 'timeout' : 'unreachable' };
    }
  }
}

function retryDelay(res: Response, attempt: number): number {
  const ra = Number(res.headers.get('retry-after'));
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 5000);
  return Math.min(500 * 2 ** attempt, 4000);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeProviderDetail(text: string): string {
  try {
    const j = JSON.parse(text);
    const msg = j?.error?.message ?? j?.detail ?? j?.message;
    return typeof msg === 'string' ? msg.slice(0, 200) : '';
  } catch {
    return '';
  }
}

async function withIdleTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError('timeout', 'The model stopped responding.')), ms);
    if (signal) {
      onAbort = () => reject(new ProviderError('aborted', 'Generation was stopped.'));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

let instance: ChatProvider | null = null;
/** Provider registry: the agent engine depends on ChatProvider, so another vendor can be added here. */
export function getChatProvider(): ChatProvider {
  if (!instance) instance = new NvidiaProvider();
  return instance;
}

export function setChatProviderForTests(p: ChatProvider | null): void {
  instance = p;
}
