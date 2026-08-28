// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eligibleForReleaseDate, releaseIdentifier, saveRelays } from './accountForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('eligibleForReleaseDate', () => {
  it('returns the date six calendar months after the last verification', () => {
    const result = eligibleForReleaseDate('2026-01-15T00:00:00.000Z');

    expect(result.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });
});

describe('saveRelays', () => {
  it('returns normalized relays returned by the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ relays: ['wss://relay.example/'] }), { status: 200 }))
    );

    await expect(saveRelays(['wss://relay.example'])).resolves.toEqual({
      ok: true,
      relays: ['wss://relay.example/']
    });
  });

  it('surfaces the server validation message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'relay 1: not a valid URL' }), { status: 400 }))
    );

    await expect(saveRelays(['bad'])).resolves.toEqual({ ok: false, error: 'relay 1: not a valid URL' });
  });
});

describe('releaseIdentifier', () => {
  it('returns success after a successful release response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    await expect(releaseIdentifier()).resolves.toEqual({ ok: true });
  });
});
