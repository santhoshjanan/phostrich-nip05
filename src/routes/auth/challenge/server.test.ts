// src/routes/auth/challenge/+server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { valkey } from '$lib/server/valkey';
import { POST } from './+server';

const TEST_IP = '127.0.0.1';

function requestEvent(body: unknown, ip = TEST_IP) {
  return {
    request: new Request('https://phostrich.test/auth/challenge', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    getClientAddress: () => ip
  } as unknown as Parameters<typeof POST>[0];
}

async function resetRateLimits(pubkey: string, ip = TEST_IP) {
  await valkey.del(`ratelimit:challenge:ip:${ip}`, `ratelimit:challenge:pubkey:${pubkey}`);
}

describe('POST /auth/challenge', () => {
  afterEach(async () => {
    await valkey.del('ratelimit:challenge:ip:' + TEST_IP);
  });

  it('returns a challenge for a valid pubkey', async () => {
    const pubkey = '5'.repeat(64);
    await resetRateLimits(pubkey);
    const response = await POST(requestEvent({ pubkey }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.challenge).toMatch(/^[0-9a-f]{32}$/);
    await resetRateLimits(pubkey);
  });

  it('returns 400 for a malformed pubkey', async () => {
    const response = await POST(requestEvent({ pubkey: 'not-hex' }));
    expect(response.status).toBe(400);
  });

  it('returns 429 once the per-pubkey rate limit is exceeded', async () => {
    const pubkey = '6'.repeat(64);
    await resetRateLimits(pubkey);
    for (let i = 0; i < 10; i++) {
      await POST(requestEvent({ pubkey }));
    }
    const response = await POST(requestEvent({ pubkey }));
    expect(response.status).toBe(429);
    await resetRateLimits(pubkey);
  });

  it('returns 429 once the per-IP rate limit is exceeded, short-circuiting before the pubkey axis', async () => {
    const ip = '10.0.0.9';
    await valkey.del(`ratelimit:challenge:ip:${ip}`);
    for (let i = 0; i < 20; i++) {
      const pubkey = ('0'.repeat(63) + i.toString(16)).slice(-64);
      const response = await POST(requestEvent({ pubkey }, ip));
      expect(response.status).not.toBe(429);
      await valkey.del(`ratelimit:challenge:pubkey:${pubkey}`);
    }

    const victimPubkey = '9'.repeat(64);
    await valkey.del(`ratelimit:challenge:pubkey:${victimPubkey}`);
    const response = await POST(requestEvent({ pubkey: victimPubkey }, ip));
    expect(response.status).toBe(429);
    // The IP axis was already blocked, so the pubkey axis must never have
    // been consulted for this victim pubkey.
    expect(await valkey.exists(`ratelimit:challenge:pubkey:${victimPubkey}`)).toBe(0);

    await valkey.del(`ratelimit:challenge:ip:${ip}`, `ratelimit:challenge:pubkey:${victimPubkey}`);
  });
});
