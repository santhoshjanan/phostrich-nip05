import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';
import { db } from '$lib/server/db';

describe('GET /healthz', () => {
  it('returns 200 against the real Postgres and Valkey', async () => {
    const response = await GET({} as unknown as Parameters<typeof GET>[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, postgres: true, valkey: true });
  });

  it('returns 503 when a dependency is down', async () => {
    const executeSpy = vi
      .spyOn(db, 'execute')
      .mockImplementation(() => Promise.reject(new Error('simulated Postgres outage')) as never);

    try {
      const response = await GET({} as unknown as Parameters<typeof GET>[0]);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, postgres: false, valkey: true });
    } finally {
      executeSpy.mockRestore();
    }
  });
});
