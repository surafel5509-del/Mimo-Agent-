'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { apiFetch, ClientApiError } from '@/lib/client/api';
import { Alert, Badge, Button, EmptyState, PageHeader, Panel, Spinner } from '@/components/ui';
import { ConfirmButton } from '@/components/ui/Confirm';

type DocumentDto = {
  id: string;
  name: string;
  extension: string;
  kind: string;
  sizeBytes: number;
  status: 'processing' | 'ready' | 'error';
  errorMessage: string | null;
  textChars: number | null;
  createdAt: string;
};

export function DocumentsView() {
  const [docs, setDocs] = useState<DocumentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ name: string; chunks: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ documents: DocumentDto[] }>('/api/documents');
      setDocs(res.documents);
    } catch {
      setError('Could not load documents.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiFetch('/api/documents', { formData: form });
      await load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
      setDocs((d) => (d ?? []).filter((x) => x.id !== id));
    } catch {
      setError('Could not delete that document.');
    }
  }

  async function open(doc: DocumentDto) {
    try {
      const res = await apiFetch<{ preview: string[] }>(`/api/documents/${doc.id}`);
      setPreview({ name: doc.name, chunks: res.preview });
    } catch {
      setError('Could not open that document.');
    }
  }

  return (
    <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
      <PageHeader
        title="Documents"
        description="Upload PDF, TXT, CSV, DOCX, PNG, JPG or JPEG files. Agents search your documents with citations. Uploaded content is treated as data, never as instructions."
        actions={
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept=".pdf,.txt,.csv,.docx,.png,.jpg,.jpeg"
              className="sr-only"
              disabled={busy}
              aria-label="Upload document"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
            <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong">
              {busy ? <Spinner label="Uploading" /> : <><Upload className="h-4 w-4" /> Upload file</>}
            </span>
          </label>
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {docs === null ? <Spinner /> : null}
      {docs && docs.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="No documents yet">
          Upload a file to ask questions about it in chat. Files up to the server limit are accepted.
        </EmptyState>
      ) : null}
      {docs && docs.length > 0 ? (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => open(d)} className="truncate text-left font-medium hover:underline">
                    {d.name}
                  </button>
                  <p className="text-xs text-muted">
                    {d.extension.toUpperCase()} · {(d.sizeBytes / 1024).toFixed(1)} KB · {new Date(d.createdAt).toLocaleDateString()}
                    {d.textChars ? ` · ${d.textChars.toLocaleString()} characters` : ''}
                  </p>
                  {d.errorMessage ? <p className="text-xs text-danger">{d.errorMessage}</p> : null}
                </div>
                <Badge tone={d.status === 'ready' ? 'ok' : d.status === 'error' ? 'danger' : 'warn'}>{d.status}</Badge>
                <ConfirmButton onConfirm={() => remove(d.id)} label={`Delete ${d.name}`} message="Delete this document and its index?">
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {preview ? (
        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Preview: {preview.name}</h2>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Close</Button>
          </div>
          {preview.chunks.length === 0 ? <p className="text-sm text-muted">No extractable text.</p> : null}
          <div className="space-y-3">
            {preview.chunks.map((c, i) => (
              <pre key={i} className="whitespace-pre-wrap rounded-xl bg-panel-2 p-3 text-xs text-muted">{c}</pre>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
