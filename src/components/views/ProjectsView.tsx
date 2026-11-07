'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { apiFetch, ClientApiError } from '@/lib/client/api';
import { Alert, Badge, Button, Input, PageHeader, Panel, Textarea } from '@/components/ui';
import { ConfirmButton } from '@/components/ui/Confirm';

type Project = { id: string; name: string; description: string; instructions: string; conversationCount?: number };
type Task = { id: string; title: string; description: string; status: 'todo' | 'in_progress' | 'blocked' | 'done'; progress: number; dueAt: string | null };
type Note = { id: string; title: string; content: string; tags: string[]; updatedAt: string };

const STATUSES: Task['status'][] = ['todo', 'in_progress', 'blocked', 'done'];

export function ProjectsView() {
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [pName, setPName] = useState('');
  const [pInstr, setPInstr] = useState('');
  const [tTitle, setTTitle] = useState('');
  const [nTitle, setNTitle] = useState('');
  const [nContent, setNContent] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ projects: Project[] }>('/api/projects'),
      apiFetch<{ tasks: Task[] }>('/api/tasks'),
      apiFetch<{ notes: Note[] }>('/api/notes'),
    ])
      .then(([p, t, n]) => {
        setProjects(p.projects);
        setTasks(t.tasks);
        setNotes(n.notes);
      })
      .catch(() => setError('Could not load your workspace data.'));
  }, []);

  const run = async (fn: () => Promise<void>, fail: string) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : fail);
    }
  };

  async function addProject(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await apiFetch('/api/projects', { body: { name: pName, instructions: pInstr, description: '' } });
      const p = await apiFetch<{ projects: Project[] }>('/api/projects');
      setProjects(p.projects);
      setPName('');
      setPInstr('');
    }, 'Could not create the project.');
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await apiFetch<{ task: Task }>('/api/tasks', { body: { title: tTitle } });
      setTasks((list) => [res.task, ...list]);
      setTTitle('');
    }, 'Could not create the task.');
  }

  async function setTaskStatus(id: string, status: Task['status']) {
    await run(async () => {
      const res = await apiFetch<{ task: Task }>(`/api/tasks/${id}`, { method: 'PATCH', body: { status, progress: status === 'done' ? 100 : undefined } });
      setTasks((list) => list.map((t) => (t.id === id ? res.task : t)));
    }, 'Could not update the task.');
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await apiFetch<{ note: Note }>('/api/notes', { body: { title: nTitle, content: nContent, tags: [] } });
      setNotes((list) => [res.note, ...list]);
      setNTitle('');
      setNContent('');
    }, 'Could not save the note.');
  }

  return (
    <div className="scrollbar-thin flex-1 space-y-8 overflow-y-auto p-6">
      <PageHeader title="Projects, tasks & notes" description="Group chats under a project with custom instructions, track tasks and keep notes the agents can use." />
      {error ? <Alert>{error}</Alert> : null}

      <section aria-labelledby="proj-h" className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 id="proj-h" className="mb-3 font-semibold">Projects</h2>
          <form onSubmit={addProject} className="mb-4 space-y-2">
            <Input placeholder="Project name" value={pName} onChange={(e) => setPName(e.target.value)} maxLength={120} aria-label="Project name" />
            <Textarea rows={2} placeholder="Instructions for agents in this project (optional)" value={pInstr} onChange={(e) => setPInstr(e.target.value)} maxLength={8000} aria-label="Project instructions" />
            <Button type="submit" variant="primary" size="sm" disabled={!pName.trim()}>Create project</Button>
          </form>
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id} className="flex items-start gap-2 rounded-xl bg-panel-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="line-clamp-2 text-xs text-muted">{p.instructions || 'No instructions'}</p>
                  <p className="mt-1 text-xs text-muted">{p.conversationCount ?? 0} chats</p>
                </div>
                <ConfirmButton
                  label={`Delete project ${p.name}`}
                  message="Delete this project? Chats are kept but unassigned."
                  onConfirm={() => run(async () => {
                    await apiFetch(`/api/projects/${p.id}`, { method: 'DELETE' });
                    setProjects((list) => list.filter((x) => x.id !== p.id));
                  }, 'Could not delete the project.')}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </li>
            ))}
            {projects.length === 0 ? <li className="text-sm text-muted">No projects yet.</li> : null}
          </ul>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-3 font-semibold">Tasks</h2>
          <form onSubmit={addTask} className="mb-4 flex gap-2">
            <Input placeholder="New task" value={tTitle} onChange={(e) => setTTitle(e.target.value)} maxLength={200} aria-label="Task title" />
            <Button type="submit" variant="primary" size="sm" disabled={!tTitle.trim()}>Add</Button>
          </form>
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-xl bg-panel-2 p-3">
                <span className={`min-w-0 flex-1 truncate text-sm ${t.status === 'done' ? 'text-muted line-through' : ''}`}>{t.title}</span>
                <select
                  aria-label={`Status of ${t.title}`}
                  value={t.status}
                  onChange={(e) => setTaskStatus(t.id, e.target.value as Task['status'])}
                  className="h-8 rounded-lg border border-line bg-panel px-2 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
                <ConfirmButton
                  label={`Delete task ${t.title}`}
                  message="Delete this task?"
                  onConfirm={() => run(async () => {
                    await apiFetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
                    setTasks((list) => list.filter((x) => x.id !== t.id));
                  }, 'Could not delete the task.')}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </li>
            ))}
            {tasks.length === 0 ? <li className="text-sm text-muted">No tasks yet. Agents can also add tasks when you ask.</li> : null}
          </ul>
          {tasks.length > 0 ? <p className="mt-3 text-xs text-muted">{tasks.filter((t) => t.status === 'done').length} of {tasks.length} done <Badge>{Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100)}%</Badge></p> : null}
        </Panel>
      </section>

      <section aria-labelledby="notes-h">
        <Panel className="p-5">
          <h2 id="notes-h" className="mb-3 font-semibold">Notes</h2>
          <form onSubmit={addNote} className="mb-4 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <Input placeholder="Note title" value={nTitle} onChange={(e) => setNTitle(e.target.value)} maxLength={200} aria-label="Note title" />
            <Input placeholder="Content" value={nContent} onChange={(e) => setNContent(e.target.value)} maxLength={50000} aria-label="Note content" />
            <Button type="submit" variant="primary" size="sm" disabled={!nTitle.trim()}>Save note</Button>
          </form>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-panel-2 p-3">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium">{n.title}</p>
                  <ConfirmButton
                    label={`Delete note ${n.title}`}
                    message="Delete this note?"
                    onConfirm={() => run(async () => {
                      await apiFetch(`/api/notes/${n.id}`, { method: 'DELETE' });
                      setNotes((list) => list.filter((x) => x.id !== n.id));
                    }, 'Could not delete the note.')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-muted">{n.content}</p>
              </li>
            ))}
            {notes.length === 0 ? <li className="text-sm text-muted">No notes yet.</li> : null}
          </ul>
        </Panel>
      </section>
    </div>
  );
}
