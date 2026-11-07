import { getEnv } from '@/lib/config';
import { getChatProvider } from './nvidia';
import type { ChatMessage, ChatRequest } from './types';
import { ProviderError } from './types';
import { recordUsage } from '@/lib/services/usage';
import { estimateTokens } from './tokens';

/**
 * Non-streaming helper built on the streaming provider. Used by tools (planner, vision,
 * summaries). Records token usage against the user for budget enforcement.
 */
export async function complete(opts: {
  userId: string | null;
  runId?: string | null;
  kind?: 'chat' | 'vision';
  request: Omit<ChatRequest, 'model'> & { model?: string };
}): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const provider = getChatProvider();
  const model = opts.request.model ?? getEnv().NVIDIA_MODEL;
  const started = Date.now();
  let text = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let ok = true;
  try {
    for await (const ev of provider.streamChat({ ...opts.request, model })) {
      if (ev.type === 'text_delta') text += ev.text;
      else if (ev.type === 'usage') {
        promptTokens = ev.promptTokens || promptTokens;
        completionTokens = ev.completionTokens || completionTokens;
      }
    }
  } catch (err) {
    ok = false;
    throw err;
  } finally {
    const pt = promptTokens || opts.request.messages.reduce((n, m) => n + estimateTokens(typeof m.content === 'string' ? m.content : ''), 0);
    const ct = completionTokens || estimateTokens(text);
    await recordUsage({
      userId: opts.userId,
      runId: opts.runId ?? null,
      model,
      kind: opts.kind ?? 'chat',
      promptTokens: pt,
      completionTokens: ct,
      latencyMs: Date.now() - started,
      ok,
    });
  }
  return { text, promptTokens, completionTokens };
}

export { ProviderError };
export type { ChatMessage };
