import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_ENV = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/phostrich',
  VALKEY_URL: 'redis://localhost:6379',
  PUBLIC_ORIGIN: 'https://phostrich.com'
};

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('parses valid env into typed config', async () => {
    Object.assign(process.env, REQUIRED_ENV, {
      DEFAULT_RELAYS: 'wss://relay.one,wss://relay.two'
    });
    const { config } = await import('./config?t=' + Date.now());
    expect(config.DATABASE_URL).toBe(REQUIRED_ENV.DATABASE_URL);
    expect(config.DEFAULT_RELAYS).toEqual(['wss://relay.one', 'wss://relay.two']);
  });

  it('defaults DEFAULT_RELAYS to an empty array when unset', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.DEFAULT_RELAYS;
    const { config } = await import('./config?t=' + Date.now());
    expect(config.DEFAULT_RELAYS).toEqual([]);
  });

  it('throws when DATABASE_URL is missing', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.DATABASE_URL;
    await expect(import('./config?t=' + Date.now())).rejects.toThrow();
  });

  it('throws when PUBLIC_ORIGIN is not a valid URL', async () => {
    Object.assign(process.env, REQUIRED_ENV, { PUBLIC_ORIGIN: 'not-a-url' });
    await expect(import('./config?t=' + Date.now())).rejects.toThrow();
  });
});
