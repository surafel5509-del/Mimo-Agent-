import { apiRoute } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { query } from '@/lib/database/pool';
import { getProfile } from '@/lib/services/profile';
import { writeAudit } from '@/lib/services/audit';
import { toPublicUser } from '@/lib/services/users';

export const dynamic = 'force-dynamic';

/** Exports everything the user owns as JSON (no password hashes, sessions or other users' data). */
export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const [conversations, messages, notes, memories, tasks, projects, documents] = await Promise.all([
    query(`SELECT id, title, mode, model, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY created_at`, [user.id]),
    query(`SELECT conversation_id, role, content, attachments, created_at FROM messages WHERE user_id = $1 ORDER BY created_at`, [user.id]),
    query(`SELECT id, title, content, tags, created_at, updated_at FROM notes WHERE user_id = $1`, [user.id]),
    query(`SELECT id, kind, content, source, created_at FROM memories WHERE user_id = $1`, [user.id]),
    query(`SELECT id, title, description, status, progress, due_at, created_at FROM tasks WHERE user_id = $1`, [user.id]),
    query(`SELECT id, name, description, instructions, created_at FROM projects WHERE user_id = $1`, [user.id]),
    query(`SELECT id, original_name, extension, size_bytes, status, created_at FROM documents WHERE user_id = $1`, [user.id]),
  ]);
  await writeAudit({ userId: user.id, category: 'data', action: 'account.export' });
  const payload = {
    exportedAt: new Date().toISOString(),
    account: toPublicUser(user),
    profile: await getProfile(user.id),
    conversations,
    messages,
    notes,
    memories,
    tasks,
    projects,
    documents,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mimo-agent-export.json"',
      'Cache-Control': 'no-store',
    },
  });
});
