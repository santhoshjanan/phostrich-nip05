// src/routes/api/identifiers/claim/+server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
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
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
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
});
