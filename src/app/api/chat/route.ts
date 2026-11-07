import { chatSchema } from '@/lib/validation/schemas';
import { apiRoute, clientIp, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { ApiError, Errors } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import {
  createConversation,
  getConversation,
  insertMessage,
  listMessages,
  truncateFromMessage,
  updateConversation,
  type MessageDto,
} from '@/lib/services/conversations';
import { getDocument, type DocumentRow } from '@/lib/services/documents';
import { getProfile, resolvePreferences } from '@/lib/services/profile';
import { getModelOptions } from '@/lib/config';
import { runAgent, type AgentRunInput } from '@/lib/agents/controller';
import type { AgentEvent, FinalMetadata } from '@/lib/agents/events';
import { getMode } from '@/lib/agents/modes';
import { getProjectInstructions } from '@/lib/services/projects';
import { writeAudit } from '@/lib/services/audit';
import { log } from '@/lib/logging/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const encoder = new TextEncoder();

async function loadOwnedAttachments(userId: string, ids: string[]): Promise<DocumentRow[]> {
  const out: DocumentRow[] = [];
  for (const id of ids) {
    const doc = await getDocument(userId, id);
    if (!doc) throw Errors.notFound('Attachment');
    if (doc.status !== 'ready') throw new ApiError(409, 'attachment_not_ready', `"${doc.original_name}" is still processing or failed.`);
    out.push(doc);
  }
  return out;
}
const sse = (ev: AgentEvent | { type: string; [k: string]: unknown }) => encoder.encode(`data: ${JSON.stringify(ev)}\n\n`);

/**
 * POST /api/chat — runs the agent for one user turn and streams events as Server-Sent Events.
 * The user message and the final assistant message are persisted server-side.
 */
export const POST = apiRoute(async (req) => {
  const user = await requireUser(req);
  enforceRateLimit(`chat:${user.id}`, 30, 60 * 1000);
  enforceRateLimit(`chat-ip:${clientIp(req)}`, 120, 60 * 1000);
  const body = chatSchema.parse(await readJson(req, 64_000));
  const profile = await getProfile(user.id);
  const prefs = resolvePreferences(profile.preferences);
  const model = body.model ?? prefs.defaultModel;
  if (!getModelOptions().includes(model)) throw new ApiError(400, 'model_not_allowed', 'That model is not enabled on this server.');
  const mode = getMode(body.mode ?? prefs.defaultMode).id;

  // Resolve or create the conversation (must belong to the user).
  let conversation = body.conversationId ? await getConversation(user.id, body.conversationId) : null;
  if (body.conversationId && !conversation) throw Errors.notFound('Conversation');
  if (!conversation) {
    if (body.regenerate) throw new ApiError(400, 'bad_request', 'Choose a conversation to regenerate.');
    conversation = await createConversation(user.id, { mode, model, projectId: body.projectId ?? null });
  }

  const existing = await listMessages(user.id, conversation.id);
  let userText: string;
  let currentUserMessageId: string | null = null;
  let userMessage: MessageDto | null = null;
  let attachments: DocumentRow[];

  if (body.regenerate) {
    // Remove the last assistant reply and re-run from the last user message.
    const lastUser = [...existing].reverse().find((m) => m.role === 'user');
    if (!lastUser) throw new ApiError(400, 'nothing_to_regenerate', 'There is no user message to regenerate from.');
    const lastAssistant = [...existing].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant && existing.indexOf(lastAssistant) > existing.indexOf(lastUser)) {
      await truncateFromMessage(user.id, conversation.id, lastAssistant.id);
    }
    userText = lastUser.content;
    currentUserMessageId = lastUser.id;
    const prevIds = (Array.isArray(lastUser.attachments) ? lastUser.attachments : []) as { id?: string }[];
    attachments = await loadOwnedAttachments(user.id, prevIds.map((a) => a.id).filter((x): x is string => typeof x === 'string'));
  } else {
    userText = body.message!.trim();
    attachments = await loadOwnedAttachments(user.id, body.attachmentIds);
    userMessage = await insertMessage({
      userId: user.id,
      conversationId: conversation.id,
      role: 'user',
      content: userText,
      attachments: attachments.map((a) => ({ id: a.id, name: a.original_name, kind: a.kind, extension: a.extension })),
      metadata: { mode, model },
    });
    currentUserMessageId = userMessage.id;
    if (conversation.title === 'New chat') {
      await updateConversation(user.id, conversation.id, { title: userText.replace(/\s+/g, ' ').slice(0, 60) });
    }
  }

  // History excludes the turn being answered and is bounded by the context manager.
  const priorRows = (await listMessages(user.id, conversation.id)).filter((m) => m.id !== currentUserMessageId);
  const history = prefs.useHistory
    ? priorRows.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : m.role === 'tool' ? ('tool' as const) : ('user' as const),
        content: m.content,
      }))
    : [];

  const projectInstructions = conversation.project_id ? await getProjectInstructions(user.id, conversation.project_id) : null;
  const runInput: AgentRunInput = {
    userId: user.id,
    conversationId: conversation.id,
    projectId: conversation.project_id,
    mode,
    model,
    userText,
    attachments,
    history: history.slice(-40),
    useMemory: prefs.memoryEnabled,
    timezone: prefs.timezone,
    projectInstructions,
    signal: req.signal,
  };

  const conversationId = conversation.id;
  const ip = clientIp(req);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: unknown) => {
        try {
          controller.enqueue(sse(ev as AgentEvent));
        } catch {
          /* client disconnected */
        }
      };
      send({ type: 'conversation', id: conversationId, title: conversation.title });
      if (userMessage) send({ type: 'message', message: userMessage });
      let final: { text: string; metadata: FinalMetadata } | null = null;
      try {
        for await (const ev of runAgent(runInput)) {
          if (ev.type === 'final') {
            final = { text: ev.text, metadata: ev.metadata };
            continue;
          }
          send(ev);
        }
        if (final) {
          const shouldPersist = final.text.trim().length > 0 || final.metadata.status !== 'cancelled';
          if (shouldPersist) {
            const saved = await insertMessage({
              userId: user.id,
              conversationId,
              role: 'assistant',
              content: final.text || '_No response was produced._',
              metadata: { ...final.metadata, stopped: final.metadata.status === 'cancelled' },
              runId: final.metadata.runId,
            });
            send({ type: 'message', message: saved });
          }
          send({ type: 'final', metadata: final.metadata });
        }
      } catch (err) {
        log('error', 'chat.stream_failed', { message: (err as Error)?.message?.slice(0, 200) });
        send({ type: 'error', code: 'internal', message: 'The response could not be completed. Please try again.' });
      } finally {
        await writeAudit({ userId: user.id, category: 'data', action: 'chat.turn', target: conversationId, ip, metadata: { mode, model } });
        send({ type: 'done' });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      // Client disconnected or pressed Stop: the request signal aborts the upstream model call.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
