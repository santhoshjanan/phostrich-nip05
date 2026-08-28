// src/routes/api/identifiers/claim/+server.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { POST } from './+server';

const TEST_NAME = 'claim-route-test-name';
const TEST_OWNER = '3'.repeat(64);

function requestEvent(body: unknown, user: { pubkey: string } | null) {
  return {
    request: new Request('https://phostrich.test/api/identifiers/claim', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/identifiers/claim', () => {
  // Several `it` blocks below reuse TEST_OWNER for a route that is now
  // per-pubkey rate-limited (see fix 8) — reset the counter before and
  // after each test so those calls never accumulate toward the limit and
  // spuriously turn an unrelated assertion into a 429.
  beforeEach(async () => {
    await valkey.del(`ratelimit:claim:pubkey:${TEST_OWNER}`);
  });

  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del(`ratelimit:claim:pubkey:${TEST_OWNER}`);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME }, null));
    expect(response.status).toBe(401);
  });

  it('claims the name and returns 201', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ name: TEST_NAME });
  });

  it('returns 409 for a name that is already taken', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: '4'.repeat(64) });
    const response = await POST(requestEvent({ name: TEST_NAME }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'not_available' });
  });

  it('returns 400 for a malformed name', async () => {
    const response = await POST(requestEvent({ name: 'Not Valid!' }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(400);
  });

  it('returns 409 { error: owner_cap } when the authenticated user already owns a claimed identifier', async () => {
    const owner = '0'.repeat(64);
    const firstName = 'claim-route-owner-cap-existing';
    await valkey.del(`ratelimit:claim:pubkey:${owner}`);
    try {
      await db.insert(identifiers).values({ name: firstName, status: 'claimed', ownerPubkey: owner });
      const response = await POST(requestEvent({ name: TEST_NAME }, { pubkey: owner }));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'owner_cap' });
    } finally {
      await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, firstName));
      await db.delete(identifiers).where(inArray(identifiers.name, [firstName, TEST_NAME]));
      await valkey.del(`ratelimit:claim:pubkey:${owner}`);
    }
  });

  it('returns 429 once the per-pubkey claim rate limit is exceeded', async () => {
    const owner = '7'.repeat(64);
    await valkey.del(`ratelimit:claim:pubkey:${owner}`);
    try {
      for (let i = 0; i < 20; i++) {
        await POST(requestEvent({ name: `claim-route-rl-${i}` }, { pubkey: owner }));
      }
      const response = await POST(requestEvent({ name: 'claim-route-rl-over' }, { pubkey: owner }));
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: 'rate limited' });
    } finally {
      const names = Array.from({ length: 20 }, (_, i) => `claim-route-rl-${i}`);
      await db.delete(identifierEvents).where(inArray(identifierEvents.identifierName, names));
      await db.delete(identifiers).where(inArray(identifiers.name, names));
      await valkey.del(`ratelimit:claim:pubkey:${owner}`);
    }
  });
});
