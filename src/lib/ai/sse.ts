/**
 * Incremental parser for OpenAI-style server-sent events. Yields the JSON payload of each
 * `data:` line and stops at `[DONE]`. Tolerates chunks split across arbitrary boundaries.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trimEnd();
        buffer = buffer.slice(idx + 1);
        const payload = extractData(line);
        if (payload === null) continue;
        if (payload === '[DONE]') return;
        try {
          yield JSON.parse(payload);
        } catch {
          // Ignore malformed keep-alive fragments rather than failing the whole stream.
        }
      }
    }
    buffer += decoder.decode();
    const last = extractData(buffer.trim());
    if (last && last !== '[DONE]') {
      try {
        yield JSON.parse(last);
      } catch {
        /* ignore */
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractData(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  return line.slice(5).trimStart();
}
