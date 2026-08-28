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

  it('defaults SESSION_TTL_DAYS to 30 when unset', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.SESSION_TTL_DAYS;
    const { config } = await import('./config?t=' + Date.now());
    expect(config.SESSION_TTL_DAYS).toBe(30);
  });

  it('parses a custom SESSION_TTL_DAYS from env', async () => {
    Object.assign(process.env, REQUIRED_ENV, { SESSION_TTL_DAYS: '7' });
    const { config } = await import('./config?t=' + Date.now());
    expect(config.SESSION_TTL_DAYS).toBe(7);
  });

  it('strips a trailing slash from PUBLIC_ORIGIN', async () => {
    Object.assign(process.env, REQUIRED_ENV, { PUBLIC_ORIGIN: 'https://phostrich.com/' });
    const { config } = await import('./config?t=' + Date.now());
    expect(config.PUBLIC_ORIGIN).toBe('https://phostrich.com');
  });

  it('defaults ADMIN_PUBKEYS to an empty array when unset', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.ADMIN_PUBKEYS;
    const { config } = await import('./config?t=' + Date.now());
    expect(config.ADMIN_PUBKEYS).toEqual([]);
  });

  it('parses and lowercases ADMIN_PUBKEYS', async () => {
    Object.assign(process.env, REQUIRED_ENV, {
      ADMIN_PUBKEYS: '6A04AB98D9E4774AD806E302DDDEB63BEA16B5CB5F223EE77478E861BB583EB3'
    });
    const { config } = await import('./config?t=' + Date.now());
    expect(config.ADMIN_PUBKEYS).toEqual([
      '0000000000000000000000000000000000000000000000000000000000000000'
    ]);
  });

  it('rejects invalid ADMIN_PUBKEYS entries', async () => {
    Object.assign(process.env, REQUIRED_ENV, { ADMIN_PUBKEYS: 'not-hex' });
    await expect(import('./config?t=' + Date.now())).rejects.toThrow();
  });
});
