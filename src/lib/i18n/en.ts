/**
 * English strings. Add a sibling file (am.ts) with the same keys to localise.
 * Keys are typed through `Dictionary`, so missing translations fail the type check.
 */
export const en = {
  brand: 'MIMO AGENT',
  tagline: 'Your Intelligent AI. Your Digital Workforce.',
  nav: {
    newChat: 'New chat',
    history: 'Chat history',
    agents: 'AI Agents',
    tools: 'Explore Tools',
    projects: 'Projects',
    documents: 'Documents',
    memory: 'Memory',
    settings: 'Settings',
    help: 'Help & Support',
    admin: 'Admin',
    signOut: 'Sign out',
  },
  chat: {
    placeholder: 'Message MIMO AGENT… (Enter to send, Shift+Enter for a new line)',
    send: 'Send',
    stop: 'Stop',
    regenerate: 'Regenerate',
    copy: 'Copy',
    copied: 'Copied',
    edit: 'Edit',
    save: 'Save & resend',
    cancel: 'Cancel',
    retry: 'Retry',
    attach: 'Attach file',
    attachImage: 'Attach image',
    voice: 'Voice input',
    welcomeTitle: 'What can I help you with today?',
    welcomeSub: 'Ask questions, analyse documents and data, research topics, write, code, or plan work.',
  },
  panel: {
    activity: 'Agent activity',
    plan: 'Task plan',
    tools: 'Tool activity',
    sources: 'Sources',
    memory: 'Memory references',
    approvals: 'Approval required',
    approve: 'Approve',
    deny: 'Deny',
  },
  settings: { language: 'Language', english: 'English', amharicSoon: 'Amharic (coming soon)' },
} as const;

export type Dictionary = typeof en;
