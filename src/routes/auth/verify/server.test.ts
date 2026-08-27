// src/routes/auth/verify/+server.test.ts
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

function requestEvent(body: unknown) {
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
    }
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

    await valkey.del('ratelimit:verify:pubkey:' + pubkey);
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

    await valkey.del('ratelimit:verify:pubkey:' + pubkey);
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

    await valkey.del('ratelimit:verify:pubkey:' + pubkey);
  });
});
