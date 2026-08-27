import { describe, expect, it } from 'vitest';
import { valkey } from '../valkey';
import { checkRateLimit } from './rateLimit';

describe('checkRateLimit', () => {
  it('allows requests up to the limit and blocks the next one', async () => {
    const key = 'ratelimit:test:' + Date.now();
    try {
      expect(await checkRateLimit(key, 2, 60)).toBe(true);
      expect(await checkRateLimit(key, 2, 60)).toBe(true);
      expect(await checkRateLimit(key, 2, 60)).toBe(false);
    } finally {
      await valkey.del(key);
    }
  });

  it('resets after the window expires', async () => {
    const key = 'ratelimit:test:' + Date.now();
    try {
      expect(await checkRateLimit(key, 1, 1)).toBe(true);
      expect(await checkRateLimit(key, 1, 1)).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await checkRateLimit(key, 1, 1)).toBe(true);
    } finally {
      await valkey.del(key);
    }
  });
});
