import type { ContextRef } from '@/lib/memory/retrieval';
import type { ToolSource } from '@/lib/tools/types';
import type { RunStatus } from '@/lib/services/runs';

export type PlanStep = { title: string; status: 'pending' | 'running' | 'done' };

export type ApprovalRequest = { id: string; tool: string; summary: string; consequences: string };

export type FinalMetadata = {
  runId: string;
  mode: string;
  model: string;
  protocol: 'native' | 'json';
  status: RunStatus;
  sources: ToolSource[];
  toolsUsed: string[];
  memoryRefs: ContextRef[];
  plan: PlanStep[] | null;
  approvals: ApprovalRequest[];
  artifacts: { type: 'chart'; title: string; svg: string }[];
  stopped?: boolean;
};

/** Events emitted by the agent controller. The chat route forwards them to the browser as SSE. */
export type AgentEvent =
  | { type: 'run'; runId: string; mode: string; model: string; protocol: 'native' | 'json' }
  | { type: 'status'; message: string }
  | { type: 'memory'; refs: ContextRef[] }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'plan_update'; steps: PlanStep[] }
  | { type: 'tool_start'; callId: string; name: string; summary: string }
  | { type: 'tool_end'; callId: string; name: string; status: 'ok' | 'error' | 'denied' | 'approval_required'; summary: string; sources?: ToolSource[]; artifacts?: { type: 'chart'; title: string; svg: string }[] }
  | { type: 'approval'; approval: ApprovalRequest }
  | { type: 'token'; text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'final'; text: string; metadata: FinalMetadata };
