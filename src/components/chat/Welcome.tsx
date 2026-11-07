'use client';

import { Sparkles } from 'lucide-react';
import { en } from '@/lib/i18n/en';

const SUGGESTIONS = [
  'Summarise my latest uploaded document with key points and open questions.',
  'What is 15% of 2,450,000 Birr, and how much is that with a 10% markup?',
  'Plan a product launch in six steps with owners and done criteria.',
  'Analyse my uploaded sales CSV and chart revenue by region.',
  'Draft a professional email requesting a project timeline update.',
  'Review this JavaScript for bugs and risky patterns.',
];

export function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-10 text-center animate-fade-up">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30">
        <Sparkles className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{en.chat.welcomeTitle}</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">{en.chat.welcomeSub}</p>
      <ul className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="h-full w-full rounded-xl border border-line bg-panel px-4 py-3 text-left text-sm text-muted transition hover:border-accent/50 hover:bg-panel-2 hover:text-fg"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
