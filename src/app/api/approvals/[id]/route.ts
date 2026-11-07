import { apiRoute, clientIp, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { ApiError } from '@/lib/http/errors';
import { approvalDecisionSchema } from '@/lib/validation/schemas';
import { parseUuid } from '@/lib/http/conversation-guards';
import { claimApproval, completeApproval } from '@/lib/services/approvals';
import { executeApprovedInvocation } from '@/lib/agents/executor';
import { getToolOverrides } from '@/lib/services/admin-config';
import { getDefaultToolResolved } from '@/lib/tools/registry';
import { insertMessage, getConversation } from '@/lib/services/conversations';
import { writeAudit } from '@/lib/services/audit';
import { getProfile, resolvePreferences } from '@/lib/services/profile';

export const dynamic = 'force-dynamic';

/**
 * Human-in-the-loop decision. The stored invocation is claimed atomically (so it runs at most
 * once), re-validated, and executed only on approval. The outcome is recorded in the chat.
 */
export const POST = apiRoute<{ id: string }>(async (req, ctx) => {
  const user = await requireUser(req);
  const id = parseUuid((await ctx.params).id, 'approval id');
  const { decision } = approvalDecisionSchema.parse(await readJson(req));
  const claimed = await claimApproval(user.id, id, decision);
  if (!claimed) throw new ApiError(409, 'approval_not_pending', 'This request is no longer pending. It may have expired or been decided already.');

  if (decision === 'deny') {
    await completeApproval(id, user.id, 'completed', { denied: true });
    await writeAudit({ userId: user.id, category: 'security', action: 'approval.denied', target: id, ip: clientIp(req), metadata: { tool: claimed.tool } });
    return jsonOk({ status: 'denied' });
  }

  const tool = getDefaultToolResolved(claimed.tool, (await getToolOverrides()).get(claimed.tool));
  if (!tool || !tool.enabled) {
    await completeApproval(id, user.id, 'failed', { error: 'tool_unavailable' });
    throw new ApiError(409, 'tool_unavailable', 'That tool is no longer enabled.');
  }
  const prefs = resolvePreferences((await getProfile(user.id)).preferences);
  const outcome = await executeApprovedInvocation({
    userId: user.id,
    runId: null,
    conversationId: claimed.conversationId,
    projectId: null,
    timezone: prefs.timezone,
    tool,
    rawInput: claimed.input,
  });
  await completeApproval(id, user.id, outcome.ok ? 'completed' : 'failed', { summary: outcome.summary });
  await writeAudit({ userId: user.id, category: 'security', action: 'approval.approved', target: id, ip: clientIp(req), metadata: { tool: claimed.tool, ok: outcome.ok } });

  // Record the outcome in the conversation so it is visible and used as context later.
  if (claimed.conversationId && (await getConversation(user.id, claimed.conversationId))) {
    await insertMessage({
      userId: user.id,
      conversationId: claimed.conversationId,
      role: 'tool',
      content: `${outcome.ok ? 'Approved and completed' : 'Approved but failed'}: ${outcome.summary}`,
      metadata: { tool: claimed.tool, approvalId: id },
    });
  }
  return jsonOk({ status: outcome.ok ? 'completed' : 'failed', summary: outcome.summary });
});
