import { describe, expect, it, vi } from 'vitest';
import { checkHealth, GET } from './+server';
import { db } from '$lib/server/db';

describe('checkHealth', () => {
  it('reports ok when both dependencies succeed', async () => {
    const result = await checkHealth(
      () => Promise.resolve(),
      () => Promise.resolve()
    );
    expect(result).toEqual({ ok: true, postgres: true, valkey: true });
  });

  it('reports not ok when Postgres fails', async () => {
    const result = await checkHealth(
      () => Promise.reject(new Error('down')),
      () => Promise.resolve()
    );
    expect(result).toEqual({ ok: false, postgres: false, valkey: true });
  });

  it('reports not ok when Valkey fails', async () => {
    const result = await checkHealth(
      () => Promise.resolve(),
      () => Promise.reject(new Error('down'))
    );
    expect(result).toEqual({ ok: false, postgres: true, valkey: false });
  });
});

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
