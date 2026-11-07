import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, passwordSchema } from '@/lib/security/passwords';
import { generateToken, hashToken, safeEqual } from '@/lib/security/tokens';
import { enforceRateLimit, resetRateLimits } from '@/lib/security/rate-limit';

describe('passwords', () => {
  it('hashes and verifies without storing the plain password', async () => {
    const hash = await hashPassword('correct-horse-1');
    expect(hash).not.toContain('correct-horse-1');
    expect(await verifyPassword('correct-horse-1', hash)).toBe(true);
    expect(await verifyPassword('wrong-password-1', hash)).toBe(false);
  });

  it('enforces the password policy', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletterslong').success).toBe(false);
    expect(passwordSchema.safeParse('1234567890123').success).toBe(false);
    expect(passwordSchema.safeParse('GoodPassword1').success).toBe(true);
  });
});

describe('tokens', () => {
  it('generates high-entropy unique tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(b);
  });

  it('hashes deterministically and never equals the raw token', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });

  it('compares in constant-time style and rejects different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('rate limiting', () => {
  it('blocks requests beyond the limit within the window', () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) enforceRateLimit('unit-key', 3, 60_000);
    expect(() => enforceRateLimit('unit-key', 3, 60_000)).toThrow();
    expect(() => enforceRateLimit('other-key', 3, 60_000)).not.toThrow();
  });
});
