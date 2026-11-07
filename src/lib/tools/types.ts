import type { z } from 'zod';

export type ToolPermission = 'read' | 'write' | 'network' | 'sensitive';

export interface ToolSource {
  title: string;
  url: string;
  /** 'sourced' = retrieved from a tool/document; the model must not present it as its own knowledge. */
  kind: 'web' | 'document';
}

export interface ToolContext {
  userId: string;
  conversationId: string | null;
  runId: string | null;
  projectId: string | null;
  timezone: string;
  signal?: AbortSignal;
  /** Set only when the user has explicitly approved this exact invocation. */
  approved: boolean;
}

export interface ToolResult {
  /** Structured, JSON-serialisable output returned to the model. */
  data: Record<string, unknown>;
  /** Short human-readable summary for the activity panel. */
  summary: string;
  sources?: ToolSource[];
  /** Optional rendered artifacts (for example SVG charts) shown to the user, never executed. */
  artifacts?: { type: 'chart'; title: string; svg: string }[];
}

export interface ToolDefinition<I extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  permission: ToolPermission;
  inputSchema: I;
  /** Default timeout; can be overridden in admin tool configuration. */
  timeoutMs: number;
  /** Whether a given invocation needs explicit user approval before it runs. */
  requiresApproval: (input: z.infer<I>) => boolean;
  /** Human-readable description of what will happen, shown on the approval card. */
  describeAction?: (input: z.infer<I>) => { summary: string; consequences: string };
  execute: (input: z.infer<I>, ctx: ToolContext) => Promise<ToolResult>;
}

export class ToolError extends Error {
  constructor(
    public readonly code: 'invalid_input' | 'not_configured' | 'not_found' | 'failed' | 'timeout' | 'denied',
    message: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}
