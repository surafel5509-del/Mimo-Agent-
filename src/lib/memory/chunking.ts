/**
 * Splits text into overlapping chunks on paragraph/sentence boundaries. Chunks are sized in
 * characters (≈ 4 chars per token) so they fit comfortably in model context.
 */
export function chunkText(text: string, targetChars = 1500, overlapChars = 200): string[] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= targetChars) return [clean];

  const units: string[] = [];
  for (const para of clean.split(/\n\n+/)) {
    if (para.length <= targetChars) {
      units.push(para);
      continue;
    }
    // Break oversize paragraphs at sentence-ish boundaries, falling back to hard cuts.
    const sentences = para.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [para];
    for (const s of sentences) {
      if (s.length <= targetChars) units.push(s);
      else for (let i = 0; i < s.length; i += targetChars) units.push(s.slice(i, i + targetChars));
    }
  }

  const chunks: string[] = [];
  let current = '';
  for (const u of units) {
    if (current && current.length + u.length + 2 > targetChars) {
      chunks.push(current.trim());
      const tail = current.slice(Math.max(0, current.length - overlapChars));
      current = `${tail}\n\n${u}`;
    } else {
      current = current ? `${current}\n\n${u}` : u;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
