import type { ApprovalRequest, PlanStep, FinalMetadata } from '@/lib/agents/events';
import type { ContextRef } from '@/lib/memory/retrieval';
import type { ToolSource } from '@/lib/tools/types';

export type MessageView = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  attachments: { id: string; name: string; kind: string; extension: string }[];
  metadata: Partial<FinalMetadata> & Record<string, unknown>;
  runId: string | null;
  createdAt: string;
  feedback?: -1 | 1 | null;
  pending?: boolean;
};

export type ToolActivity = {
  callId: string;
  name: string;
  summary: string;
  status: 'running' | 'ok' | 'error' | 'denied' | 'approval_required';
};

export type RunView = {
  status: 'idle' | 'running' | 'completed' | 'awaiting_approval' | 'cancelled' | 'failed' | 'step_limit';
  runId: string | null;
  mode: string | null;
  model: string | null;
  protocol: 'native' | 'json' | null;
  plan: PlanStep[] | null;
  tools: ToolActivity[];
  memory: ContextRef[];
  sources: ToolSource[];
  approvals: ApprovalRequest[];
  notice: string | null;
  error: string | null;
};

export const EMPTY_RUN: RunView = {
  status: 'idle',
  runId: null,
  mode: null,
  model: null,
  protocol: null,
  plan: null,
  tools: [],
  memory: [],
  sources: [],
  approvals: [],
  notice: null,
  error: null,
};
