'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

/**
 * Markdown renderer. Raw HTML is NOT enabled (no rehype-raw), so model or document output
 * cannot inject markup. Links open in a new tab without opener access; images are not loaded
 * from remote hosts (prevents tracking pixels).
 */
const components: Components = {
  a({ href, children }) {
    const safe = href && /^(https?:|mailto:|#|\/)/i.test(href) ? href : undefined;
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="underline">
        {children}
      </a>
    );
  },
  img({ alt }) {
    return <span className="text-muted">[image{alt ? `: ${alt}` : ''}]</span>;
  },
  table({ children }) {
    return <div className="overflow-x-auto"><table>{children}</table></div>;
  },
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
