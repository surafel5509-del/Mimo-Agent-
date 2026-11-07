const PATTERNS: RegExp[] = [
  /nvapi-[A-Za-z0-9_\-]{8,}/g, // NVIDIA API keys
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /sk-[A-Za-z0-9]{16,}/g,
  /(password|passwd|secret|token|api[_-]?key)"?\s*[:=]\s*"?[^"\s,}&]+/gi,
  /postgres(ql)?:\/\/[^\s"']+/gi,
  /mimo_session=[^;\s"]+/gi,
];

/** Removes credentials from any string before it is logged or returned to a client. */
export function redactSecrets(input: string): string {
  let out = input;
  for (const p of PATTERNS) out = out.replace(p, '[REDACTED]');
  return out;
}
