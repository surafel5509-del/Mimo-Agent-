'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ImagePlus, Loader2, Mic, MicOff, Paperclip, Send, Square, X } from 'lucide-react';
import { getCsrfToken } from '@/lib/client/api';
import { en } from '@/lib/i18n/en';
import { AGENT_MODES, type AgentModeId } from '@/lib/agents/modes';
import { Alert } from '@/components/ui';

export type AttachedFile = { id: string; name: string; kind: string; status: string; error?: string | null };

const ACCEPT = '.pdf,.txt,.csv,.docx,.png,.jpg,.jpeg';
const IMAGE_ACCEPT = '.png,.jpg,.jpeg';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function Composer(props: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  mode: AgentModeId;
  onModeChange: (m: AgentModeId) => void;
  models: string[];
  model: string;
  onModelChange: (m: string) => void;
  attachments: AttachedFile[];
  onAttach: (f: AttachedFile) => void;
  onRemoveAttachment: (id: string) => void;
  capabilities: { vision: boolean };
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [props.value]);

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!props.streaming && props.value.trim() && !uploading) props.onSend();
    } else if (e.key === 'Escape' && props.streaming) {
      props.onStop();
    }
  }

  async function upload(file: File) {
    setUploadError(null);
    setUploading({ name: file.name, progress: 0 });
    try {
      const token = await getCsrfToken();
      const doc = await new Promise<AttachedFile>((resolve, reject) => {
        const form = new FormData();
        form.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/documents');
        xhr.setRequestHeader('x-csrf-token', token);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploading({ name: file.name, progress: Math.round((ev.loaded / ev.total) * 100) });
        };
        xhr.onload = () => {
          const json = safeJson(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            const d = json.document as { id: string; name: string; kind: string; status: string; errorMessage?: string | null };
            resolve({ id: d.id, name: d.name, kind: d.kind, status: d.status, error: d.errorMessage ?? null });
          }
          else reject(new Error(json?.error?.message ?? 'Upload failed.'));
        };
        xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
        xhr.send(form);
      });
      if (doc.status === 'error') setUploadError(doc.error ?? `"${file.name}" could not be processed.`);
      props.onAttach(doc);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(null);
    }
  }

  function toggleVoice() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      props.onChange(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const selectedMode = AGENT_MODES[props.mode];
  const canSend = !props.streaming && props.value.trim().length > 0 && !uploading && !props.disabled;

  return (
    <div className="border-t border-line bg-bg/80 px-3 pb-3 pt-2 backdrop-blur sm:px-6">
      <div className="mx-auto max-w-3xl">
        {props.attachments.length ? (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attached files">
            {props.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-full border border-line bg-panel-2 py-1 pl-3 pr-1 text-xs">
                <span className="max-w-[12rem] truncate">{a.name}</span>
                <span className={a.status === 'ready' ? 'text-ok' : 'text-danger'}>{a.status === 'ready' ? 'ready' : 'error'}</span>
                <button type="button" onClick={() => props.onRemoveAttachment(a.id)} aria-label={`Remove ${a.name}`} className="rounded-full p-1 text-muted hover:bg-panel-3 hover:text-fg">
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {uploading ? (
          <div className="mb-2 text-xs text-muted" role="status">
            Uploading {uploading.name}… {uploading.progress}%
            <div className="mt-1 h-1 overflow-hidden rounded bg-panel-3" aria-hidden>
              <div className="h-full bg-accent transition-all" style={{ width: `${uploading.progress}%` }} />
            </div>
          </div>
        ) : null}
        {uploadError ? (
          <div className="mb-2">
            <Alert>{uploadError}</Alert>
          </div>
        ) : null}
        <div className="rounded-2xl border border-line bg-panel shadow-lg shadow-black/10 focus-within:border-accent/60">
          <label className="sr-only" htmlFor="chat-input">
            {en.chat.placeholder}
          </label>
          <textarea
            id="chat-input"
            ref={ref}
            rows={1}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            onKeyDown={onKey}
            placeholder={en.chat.placeholder}
            disabled={props.disabled}
            className="scrollbar-thin block max-h-56 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[0.95rem] placeholder:text-muted focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
            <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            <input ref={imageRef} type="file" accept={IMAGE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            <IconButton label={en.chat.attach} onClick={() => fileRef.current?.click()} disabled={props.streaming || !!uploading}>
              <Paperclip className="h-4 w-4" />
            </IconButton>
            <IconButton label={en.chat.attachImage} onClick={() => imageRef.current?.click()} disabled={props.streaming || !!uploading}>
              <ImagePlus className="h-4 w-4" />
            </IconButton>
            {voiceSupported ? (
              <IconButton label={en.chat.voice} onClick={toggleVoice} active={listening} disabled={props.streaming}>
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </IconButton>
            ) : null}
            <label className="sr-only" htmlFor="mode-select">Agent mode</label>
            <select
              id="mode-select"
              value={props.mode}
              onChange={(e) => props.onModeChange(e.target.value as AgentModeId)}
              disabled={props.streaming}
              className="h-8 max-w-[10rem] truncate rounded-lg border border-transparent bg-transparent px-2 text-xs text-muted hover:bg-panel-3 focus:border-accent focus:outline-none"
              title={selectedMode.description}
            >
              {Object.values(AGENT_MODES).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="model-select">Model</label>
            <select
              id="model-select"
              value={props.model}
              onChange={(e) => props.onModelChange(e.target.value)}
              disabled={props.streaming}
              className="h-8 max-w-[12rem] truncate rounded-lg border border-transparent bg-transparent px-2 text-xs text-muted hover:bg-panel-3 focus:border-accent focus:outline-none"
            >
              {props.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="ml-auto">
              {props.streaming ? (
                <button type="button" onClick={props.onStop} aria-label={en.chat.stop} className="flex h-9 items-center gap-2 rounded-xl bg-panel-3 px-3 text-sm hover:bg-line">
                  <Square className="h-3.5 w-3.5 fill-current" /> {en.chat.stop}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={props.onSend}
                  disabled={!canSend}
                  aria-label={en.chat.send}
                  className="flex h-9 items-center gap-2 rounded-xl bg-accent px-3.5 text-sm font-medium text-white shadow-sm shadow-accent/30 transition hover:bg-accent-strong disabled:opacity-40"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {en.chat.send}
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted">
          AI can make mistakes. Check important information. Sensitive actions always ask for your approval.
          {!props.capabilities.vision ? ' Image analysis is off until a vision model is configured.' : ''}
        </p>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children, disabled, active }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-panel-3 hover:text-fg disabled:opacity-40 ${active ? 'bg-accent/20 text-accent' : ''}`}
    >
      {children}
    </button>
  );
}

function safeJson(t: string): any {
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}
