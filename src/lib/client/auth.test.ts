// src/lib/client/auth.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuthEventTemplate, signInWithBunker, signInWithExtension } from './auth';

describe('buildAuthEventTemplate', () => {
  it('builds a kind 27235 event template with the challenge and origin', () => {
    const template = buildAuthEventTemplate('https://phostrich.test', 'abc123');
    expect(template.kind).toBe(27235);
    expect(template.tags).toEqual([
      ['u', 'https://phostrich.test/auth/verify'],
      ['method', 'POST'],
      ['challenge', 'abc123']
    ]);
    expect(template.content).toBe('');
  });
});

describe('signInWithExtension', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error test cleanup
    delete window.nostr;
  });

  it('throws when no extension is present', async () => {
    await expect(signInWithExtension()).rejects.toThrow('No Nostr extension detected.');
  });

  it('requests a challenge, signs it, and posts it to /auth/verify', async () => {
    const fakeEvent = { id: 'x', kind: 27235, pubkey: 'p'.repeat(64), sig: 's'.repeat(128) };
    // @ts-expect-error test double
    window.nostr = {
      getPublicKey: async () => 'p'.repeat(64),
      signEvent: async () => fakeEvent
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/challenge')) {
        return new Response(JSON.stringify({ challenge: 'the-nonce' }), { status: 200 });
      }
      return new Response(JSON.stringify({ pubkey: 'p'.repeat(64) }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await signInWithExtension();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const verifyCall = fetchMock.mock.calls[1];
    const verifyBody = JSON.parse((verifyCall[1] as RequestInit).body as string);
    expect(verifyBody.event).toEqual(fakeEvent);
  });
});

describe('signInWithBunker', () => {
  it('throws a clear error for an invalid bunker URI', async () => {
    await expect(signInWithBunker('not-a-bunker-uri')).rejects.toThrow(
      'That does not look like a valid bunker connection.'
    );
  });
});
