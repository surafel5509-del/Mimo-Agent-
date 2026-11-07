import 'server-only';
import { complete } from '@/lib/ai/complete';
import { wrapUntrusted } from '@/lib/security/sanitize';
import type { PlanStep } from './events';

/**
 * Asks the model for a short, ordered plan as JSON. Returns null when the output cannot be
 * parsed, in which case the agent proceeds without a visible plan.
 */
export async function createPlan(input: {
  userId: string;
  runId: string | null;
  goal: string;
  modeName: string;
  model: string;
}): Promise<PlanStep[] | null> {
  const { text } = await complete({
    userId: input.userId,
    runId: input.runId,
    request: {
      model: input.model,
      temperature: 0.1,
      maxTokens: 400,
      timeoutMs: 30000,
      messages: [
        {
          role: 'system',
          content:
            `You are the planning module for a ${input.modeName}. Break the user's goal into 2 to 6 short, concrete, ordered steps. ` +
            'Respond with ONLY JSON in this exact shape: {"steps":["step one","step two"]}. No other text.',
        },
        { role: 'user', content: wrapUntrusted('user_goal', input.goal, 2000) },
      ],
    },
  });
  const steps = parsePlanJson(text);
  return steps ? steps.map((title, i) => ({ title, status: i === 0 ? 'running' : 'pending' })) : null;
}

export function parsePlanJson(text: string): string[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { steps?: unknown };
    if (!Array.isArray(obj.steps)) return null;
    const steps = obj.steps
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim().slice(0, 160))
      .slice(0, 6);
    return steps.length >= 2 ? steps : null;
  } catch {
    return null;
  }
}

/** Heuristic used to decide whether a request deserves an explicit plan. */
export function looksComplex(text: string): boolean {
  return text.length > 400 || /\b(step[- ]by[- ]step|steps?|plan|roadmap|milestones?|first\b.*\bthen\b|multi[- ]step)\b/i.test(text);
}
