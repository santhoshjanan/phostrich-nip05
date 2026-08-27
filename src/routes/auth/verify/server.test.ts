// src/routes/auth/verify/server.test.ts
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate } from 'nostr-tools';
import { valkey } from '$lib/server/valkey';
import { config } from '$lib/server/config';
import { issueChallenge } from '$lib/server/auth/challenge';
import { SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { POST } from './+server';

function buildEvent(challenge: string, secretKey: Uint8Array) {
  const template: EventTemplate = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', `${config.PUBLIC_ORIGIN}/auth/verify`],
      ['method', 'POST'],
      ['challenge', challenge]
    ],
    content: ''
  };
  return finalizeEvent(template, secretKey);
}

function requestEvent(body: unknown, ip = '127.0.0.1') {
  const cookieStore: Record<string, string> = {};
  const event = {
    request: new Request('https://phostrich.test/auth/verify', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    cookies: {
      set: (name: string, value: string) => {
        cookieStore[name] = value;
      }
    },
    getClientAddress: () => ip
  };
  return { event, cookieStore };
}

describe('POST /auth/verify', () => {
  it('sets a session cookie for a valid signed event', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);
    const event = buildEvent(nonce, sk);

    const { event: evt, cookieStore } = requestEvent({ event });
    const response = await POST(evt as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(200);
    expect(cookieStore[SESSION_COOKIE_NAME]).toBeDefined();

    await valkey.del('ratelimit:verify:pubkey:' + pubkey, 'ratelimit:verify:ip:127.0.0.1');
  });

  it('returns 401 for an invalid signature', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);
    const event = buildEvent(nonce, sk);
    event.sig = event.sig.slice(0, -2) + '00';

    const { event: evt } = requestEvent({ event });
    const response = await POST(evt as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(401);

    await valkey.del('ratelimit:verify:pubkey:' + pubkey, 'ratelimit:verify:ip:127.0.0.1');
  });

  it('returns 401 when the request body has no event', async () => {
    const { event: evt } = requestEvent({});
    const response = await POST(evt as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(401);
  });

  it('returns 401 (not 500 or 503) when the event has no tags array', async () => {
    const pubkey = 'a'.repeat(64);
    const { event: evt } = requestEvent({ event: { pubkey, kind: 27235 } });
    const response = await POST(evt as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(401);

    await valkey.del('ratelimit:verify:pubkey:' + pubkey, 'ratelimit:verify:ip:127.0.0.1');
  });

  it('returns 401 when the pubkey is not 64-hex (rejected structurally by verifyAuthEvent)', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);
    const event = buildEvent(nonce, sk);
    const malformedPubkey = 'not-a-valid-pubkey';
    const malformed = { ...event, pubkey: malformedPubkey };

    const { event: evt } = requestEvent({ event: malformed });
    const response = await POST(evt as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(401);

    await valkey.del('ratelimit:verify:pubkey:' + pubkey);
    await valkey.del('ratelimit:verify:pubkey:' + malformedPubkey);
    await valkey.del('ratelimit:verify:ip:127.0.0.1');
  });

  describe('malformed tags shapes (must be 401, never 500/503)', () => {
    const cases: [string, unknown][] = [
      ['tags=[null]', [null]],
      ['tags=[[]]', [[]]],
      ['tags=["u"]', ['u']],
      ['tags=[{}]', [{}]],
      ['tags=[0]', [0]]
    ];

    it.each(cases)('%s returns 401', async (_label, tags) => {
      const pubkey = 'b'.repeat(64);
      const malformed = {
        pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        id: 'a'.repeat(64),
        sig: 'a'.repeat(128),
        content: '',
        tags
      };

      const { event: evt } = requestEvent({ event: malformed }, '127.0.0.2');
      const response = await POST(evt as unknown as Parameters<typeof POST>[0]);
      expect(response.status).toBe(401);

      await valkey.del('ratelimit:verify:pubkey:' + pubkey);
      await valkey.del('ratelimit:verify:ip:127.0.0.2');
    });
  });

  it('returns 429 once the pubkey-axis rate limit is exceeded', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const ip = '127.0.0.3';

    await valkey.del('ratelimit:verify:pubkey:' + pubkey, 'ratelimit:verify:ip:' + ip);

    for (let i = 0; i < 10; i++) {
      const nonce = await issueChallenge(pubkey);
      const event = buildEvent(nonce, sk);
      const { event: evt } = requestEvent({ event }, ip);
      await POST(evt as unknown as Parameters<typeof POST>[0]);
    }

    const nonce = await issueChallenge(pubkey);
    const event = buildEvent(nonce, sk);
    const { event: evt } = requestEvent({ event }, ip);
    const response = await POST(evt as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(429);

    await valkey.del('ratelimit:verify:pubkey:' + pubkey, 'ratelimit:verify:ip:' + ip);
  });

  it('returns 429 once the IP-axis rate limit is exceeded (mirroring challenge)', async () => {
    const ip = '127.0.0.4';
    await valkey.del('ratelimit:verify:ip:' + ip);

    for (let i = 0; i < 20; i++) {
      const sk = generateSecretKey();
      const pubkey = getPublicKey(sk);
      const nonce = await issueChallenge(pubkey);
      const event = buildEvent(nonce, sk);
      const { event: evt } = requestEvent({ event }, ip);
      const resp = await POST(evt as unknown as Parameters<typeof POST>[0]);
      // clean up per-pubkey key so we're only exhausting the IP axis
      await valkey.del('ratelimit:verify:pubkey:' + pubkey);
      expect(resp.status).not.toBe(429);
    }

    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);
    const event = buildEvent(nonce, sk);
    const { event: evt } = requestEvent({ event }, ip);
    const response = await POST(evt as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(429);

    await valkey.del('ratelimit:verify:pubkey:' + pubkey, 'ratelimit:verify:ip:' + ip);
  });
});
