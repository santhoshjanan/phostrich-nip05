import { describe, expect, it } from 'vitest';
import { withApiErrorHandling } from './errorHandling';

describe('withApiErrorHandling', () => {
  it('returns the wrapped response on success', async () => {
    const response = await withApiErrorHandling(async () => new Response('ok', { status: 200 }));
    expect(response.status).toBe(200);
  });

  it('returns 503 when the wrapped function throws (e.g. Valkey unreachable)', async () => {
    const response = await withApiErrorHandling(async () => {
      throw new Error('connection refused');
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'service unavailable' });
  });
});
