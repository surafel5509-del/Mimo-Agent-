import { ApiError } from '@/lib/http/errors';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window in-memory rate limiter. Suitable for a single instance. For multi-instance
 * deployments back this with Redis or the edge provider's rate limiting.
 */
export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) pruneExpired(now);
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new ApiError(429, 'rate_limited', `Too many requests. Please wait ${retry} seconds and try again.`);
  }
}

function pruneExpired(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function resetRateLimits(): void {
  buckets.clear();
}
