import { afterAll, describe, expect, it } from 'vitest';
import { valkey } from './valkey';

describe('valkey client', () => {
  afterAll(async () => {
    await valkey.quit();
  });

  it('can set and get a value against the real Valkey instance', async () => {
    await valkey.set('foundation:smoke-test', 'ok', 'EX', 5);
    const value = await valkey.get('foundation:smoke-test');
    expect(value).toBe('ok');
  });
});
