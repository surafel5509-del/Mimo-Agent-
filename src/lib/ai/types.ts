export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  /** Aborts the upstream request (client disconnect or user pressed Stop). */
  signal?: AbortSignal;
  /** Idle timeout between streamed chunks, in ms. */
  timeoutMs?: number;
}

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'finish'; reason: string | null };

export interface ModelCapabilities {
  chat: boolean;
  /** true = confirmed by configuration; 'unknown' = attempt and fall back on failure. */
  toolCalling: boolean | 'unknown';
  vision: boolean;
  embeddings: boolean;
  streaming: boolean;
}

export interface ChatProvider {
  readonly id: string;
  capabilities(model: string): ModelCapabilities;
  streamChat(req: ChatRequest): AsyncGenerator<StreamEvent>;
  embed(texts: string[]): Promise<number[][]>;
  health(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

export type ProviderErrorCode =
  | 'auth'
  | 'rate_limited'
  | 'timeout'
  | 'bad_request'
  | 'unavailable'
  | 'unsupported'
  | 'aborted'
  | 'not_configured'
  | 'invalid_response';

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
