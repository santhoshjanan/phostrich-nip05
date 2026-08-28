// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  eligibleForReleaseDate,
  parseRelayError,
  releaseIdentifier,
  saveRelays
} from './accountForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('eligibleForReleaseDate', () => {
  it('returns the date six calendar months after the last verification', () => {
    const result = eligibleForReleaseDate('2026-01-15T00:00:00.000Z');

    expect(result.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('clamps August 31 to February 28 in a common year', () => {
    expect(eligibleForReleaseDate('2026-08-31T12:34:56.000Z').toISOString()).toBe(
      '2027-02-28T12:34:56.000Z'
    );
  });

  it('clamps August 31 to February 29 in a leap year', () => {
    expect(eligibleForReleaseDate('2027-08-31T12:34:56.000Z').toISOString()).toBe(
      '2028-02-29T12:34:56.000Z'
    );
  });
});

describe('saveRelays', () => {
  it('returns normalized relays returned by the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ relays: ['wss://relay.example/'] }), { status: 200 })
      )
    );

    await expect(saveRelays(['wss://relay.example'])).resolves.toEqual({
      ok: true,
      relays: ['wss://relay.example/']
    });
  });

  it('surfaces the server validation message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'relay 1: not a valid URL' }), { status: 400 })
      )
    );

    await expect(saveRelays(['bad'])).resolves.toEqual({
      ok: false,
      error: 'relay 1: not a valid URL'
    });
  });

  it('returns a recoverable error when saving relays cannot reach the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('network detail')))
    );

    await expect(saveRelays([])).resolves.toEqual({
      ok: false,
      error: 'Could not reach the server. Check your connection and try again.'
    });
  });

  it('returns a safe error when a failed relay response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gateway failure', { status: 502 }))
    );

    await expect(saveRelays([])).resolves.toEqual({
      ok: false,
      error: 'We could not save your relays. Please try again.'
    });
  });
});

describe('releaseIdentifier', () => {
  it('returns success after a successful release response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    await expect(releaseIdentifier()).resolves.toEqual({ ok: true });
  });

  it('returns a recoverable error when release cannot reach the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('network detail')))
    );

    await expect(releaseIdentifier()).resolves.toEqual({
      ok: false,
      error: 'Could not reach the server. Check your connection and try again.'
    });
  });
});

describe('parseRelayError', () => {
  it('maps a one-based relay validation error to a zero-based row', () => {
    expect(parseRelayError('relay 2: must start with wss://')).toEqual({
      index: 1,
      message: 'must start with wss://'
    });
  });

  it('leaves non-indexed errors at section level', () => {
    expect(
      parseRelayError('Could not reach the server. Check your connection and try again.')
    ).toBeNull();
  });
});
