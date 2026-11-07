/** Rough token estimate (≈4 characters per token for English text). Used for budgeting only. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
