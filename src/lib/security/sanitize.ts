/** Strips control characters (except tab/newline) and trims. Used for free-text input. */
export function cleanText(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/** Keeps a filename safe for display: no path separators, no control chars, bounded length. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return (cleaned || 'file').slice(0, 200);
}

/**
 * Text from untrusted sources (web pages, documents, tool output) is wrapped in explicit
 * delimiters so the model treats it as data, never as instructions.
 */
export function wrapUntrusted(label: string, content: string, maxChars = 6000): string {
  const body = content.length > maxChars ? `${content.slice(0, maxChars)}\n[truncated]` : content;
  return `<untrusted_data source="${label.replace(/[^a-zA-Z0-9 _.-]/g, '')}">\n${body.replace(/<\/?untrusted_data[^>]*>/gi, '')}\n</untrusted_data>`;
}
