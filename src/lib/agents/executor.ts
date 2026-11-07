import 'server-only';
import { z } from 'zod';
import { ToolError, type ToolContext } from '@/lib/tools/types';
import { resolveTool, type ResolvedTool, UNTRUSTED_OUTPUT_TOOLS } from '@/lib/tools/registry';
import type { ToolSource } from '@/lib/tools/types';
import { createApproval, type ApprovalDto } from '@/lib/services/approvals';
import { recordStep } from '@/lib/services/runs';
import { wrapUntrusted } from '@/lib/security/sanitize';
import { log } from '@/lib/logging/logger';
import { getEnv } from '@/lib/config';

export type ExecState = {
  userId: string;
  conversationId: string | null;
  runId: string;
  projectId: string | null;
  timezone: string;
  signal?: AbortSignal;
  tools: Map<string, ResolvedTool>;
  loopGuard: Map<string, number>;
  toolCalls: number;
  maxToolCalls: number;
  nextStepIdx: () => number;
};

export type ExecOutcome = {
  status: 'ok' | 'error' | 'denied' | 'approval_required';
  name: string;
  summary: string;
  /** Text returned to the model. Untrusted sources are wrapped in data delimiters. */
  modelContent: string;
  sources?: ToolSource[];
  artifacts?: { type: 'chart'; title: string; svg: string }[];
  approval?: ApprovalDto;
  durationMs: number;
};

const MODEL_RESULT_CHARS = 6000;

function stableKey(name: string, input: unknown): string {
  return `${name}:${JSON.stringify(input, Object.keys((input ?? {}) as object).sort())}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ToolError('timeout', 'The tool took too long and was stopped.')), ms);
    if (signal) {
      onAbort = () => reject(new ToolError('timeout', 'Stopped by the user.'));
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  return Promise.race([p, guard]).finally(() => {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  });
}

function formatForModel(name: string, data: unknown): string {
  const json = JSON.stringify(data) ?? 'null';
  const body = json.length > MODEL_RESULT_CHARS ? `${json.slice(0, MODEL_RESULT_CHARS)}…[truncated]` : json;
  return UNTRUSTED_OUTPUT_TOOLS.has(name) ? wrapUntrusted(name, body, MODEL_RESULT_CHARS) : body;
}

/**
 * Executes one model-requested tool call through every control point:
 * availability → argument validation → loop guard → call budget → approval gate → timeout.
 * Failures are returned to the model as TOOL_ERROR text, never thrown into the loop.
 */
export async function executeToolCall(
  state: ExecState,
  call: { name: string; rawInput: unknown },
  opts: { callId?: string } = {},
): Promise<ExecOutcome> {
  const started = Date.now();
  const stepIdx = state.nextStepIdx();
  const fail = async (status: 'error' | 'denied', message: string, name = call.name): Promise<ExecOutcome> => {
    await recordStep({ runId: state.runId, userId: state.userId, idx: stepIdx, kind: 'tool', name, input: call.rawInput, output: { error: message }, status: status === 'denied' ? 'denied' : 'error', durationMs: Date.now() - started });
    return { status, name, summary: message, modelContent: `TOOL_ERROR ${name}: ${message}`, durationMs: Date.now() - started };
  };

  const resolved = state.tools.get(call.name);
  if (!resolved || !resolved.enabled) return fail('error', `Tool "${call.name}" is not available in this mode.`);

  let rawObj: unknown = call.rawInput;
  if (typeof rawObj === 'string') {
    try {
      rawObj = rawObj.trim() === '' ? {} : JSON.parse(rawObj);
    } catch {
      return fail('error', 'Tool arguments were not valid JSON.');
    }
  }
  const parsed = resolved.def.inputSchema.safeParse(rawObj);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    return fail('error', `Invalid input for ${call.name}. ${issues}`);
  }
  const input = parsed.data;

  const key = stableKey(call.name, input);
  const repeats = (state.loopGuard.get(key) ?? 0) + 1;
  state.loopGuard.set(key, repeats);
  if (repeats > 2) {
    return fail('error', 'This exact tool call was already made. Use the result you already have instead of repeating it.');
  }
  if (state.toolCalls >= state.maxToolCalls) {
    return fail('error', 'The tool call limit for this request was reached. Answer with the information you have.');
  }
  state.toolCalls += 1;

  if (resolved.requiresApproval(input)) {
    const described = resolved.def.describeAction?.(input) ?? {
      summary: `Run ${call.name}`,
      consequences: 'This action changes your data.',
    };
    const approval = await createApproval({
      userId: state.userId,
      runId: state.runId,
      conversationId: state.conversationId,
      tool: call.name,
      input,
      summary: described.summary,
      consequences: described.consequences,
    });
    await recordStep({ runId: state.runId, userId: state.userId, idx: stepIdx, kind: 'approval', name: call.name, input, output: { approvalId: approval.id }, status: 'pending', durationMs: Date.now() - started });
    return {
      status: 'approval_required',
      name: call.name,
      summary: described.summary,
      modelContent: `APPROVAL_REQUESTED ${call.name}: the user must approve "${described.summary}" before it runs. Tell the user and do not assume it succeeded.`,
      approval,
      durationMs: Date.now() - started,
    };
  }

  try {
    const ctx: ToolContext = {
      userId: state.userId,
      conversationId: state.conversationId,
      runId: state.runId,
      projectId: state.projectId,
      timezone: state.timezone,
      signal: state.signal,
      approved: false,
    };
    const result = await withTimeout(resolved.def.execute(input, ctx), resolved.timeoutMs, state.signal);
    const durationMs = Date.now() - started;
    await recordStep({ runId: state.runId, userId: state.userId, idx: stepIdx, kind: 'tool', name: call.name, input, output: { summary: result.summary, data: result.data, sources: result.sources }, status: 'ok', durationMs });
    return {
      status: 'ok',
      name: call.name,
      summary: result.summary,
      modelContent: `TOOL_RESULT ${call.name}: ${formatForModel(call.name, result.data)}`,
      sources: result.sources,
      artifacts: result.artifacts,
      durationMs,
    };
  } catch (err) {
    const msg = err instanceof ToolError ? err.message : 'The tool failed unexpectedly.';
    if (!(err instanceof ToolError)) log('error', 'tool.failed', { tool: call.name, message: (err as Error).message?.slice(0, 200) });
    return fail(err instanceof ToolError && err.code === 'denied' ? 'denied' : 'error', msg);
  }
}

/**
 * Runs an invocation that a user has explicitly approved. The stored input is re-validated
 * against the current schema, and the tool must still be enabled.
 */
export async function executeApprovedInvocation(input: {
  userId: string;
  runId: string | null;
  conversationId: string | null;
  projectId: string | null;
  timezone: string;
  tool: ResolvedTool;
  rawInput: unknown;
}): Promise<{ ok: boolean; summary: string; data?: unknown }> {
  const parsed = input.tool.def.inputSchema.safeParse(input.rawInput);
  if (!parsed.success) return { ok: false, summary: 'The approved request is no longer valid.' };
  const ctx: ToolContext = {
    userId: input.userId,
    conversationId: input.conversationId,
    runId: input.runId,
    projectId: input.projectId,
    timezone: input.timezone,
    approved: true,
    signal: AbortSignal.timeout(getEnv().AGENT_TOOL_TIMEOUT_MS),
  };
  try {
    const result = await withTimeout(input.tool.def.execute(parsed.data, ctx), input.tool.timeoutMs);
    return { ok: true, summary: result.summary, data: result.data };
  } catch (err) {
    return { ok: false, summary: err instanceof ToolError ? err.message : 'The action failed.' };
  }
}

export { resolveTool, z };
