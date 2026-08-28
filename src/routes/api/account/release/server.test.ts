import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { POST } from './+server';

const TEST_NAME = 'release-route-test';
const TEST_OWNER = '8'.repeat(64);

function requestEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as Parameters<typeof POST>[0];
}

describe('POST /api/account/release', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await POST(requestEvent(null));

    expect(response.status).toBe(401);
  });

  it('returns not found when the caller owns no claimed identifier', async () => {
    const response = await POST(requestEvent({ pubkey: TEST_OWNER }));

    expect(response.status).toBe(404);
  });

  it('deletes the identifier, records the release, and invalidates the cache', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    await valkey.set('identifier:' + TEST_NAME, JSON.stringify({ pubkey: TEST_OWNER, relays: [] }), 'EX', 300);

    const response = await POST(requestEvent({ pubkey: TEST_OWNER }));

    expect(response.status).toBe(200);
    expect(await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME))).toHaveLength(0);

    const [event] = await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(event).toMatchObject({ eventType: 'released', actorPubkey: TEST_OWNER });
    expect(await valkey.get('identifier:' + TEST_NAME)).toBeNull();
  });
});
