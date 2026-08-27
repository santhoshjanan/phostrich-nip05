import { describe, expect, it } from 'vitest';
import { checkHealth } from './health';

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
