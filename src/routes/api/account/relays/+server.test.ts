import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { PUT } from './+server';

const TEST_NAME = 'relays-route-test';
const TEST_OWNER = '7'.repeat(64);

function requestEvent(body: unknown, user: { pubkey: string } | null) {
  return {
    request: new Request('https://phostrich.test/api/account/relays', {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as Parameters<typeof PUT>[0];
}

describe('PUT /api/account/relays', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await PUT(requestEvent({ relays: [] }, null));

    expect(response.status).toBe(401);
  });

  it('returns not found when the caller owns no claimed identifier', async () => {
    const response = await PUT(requestEvent({ relays: [] }, { pubkey: TEST_OWNER }));

    expect(response.status).toBe(404);
  });

  it('persists normalized relays and invalidates the identifier cache', async () => {
    await db
      .insert(identifiers)
      .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER, relays: [] });
    await valkey.set('identifier:' + TEST_NAME, JSON.stringify({ pubkey: TEST_OWNER, relays: [] }), 'EX', 300);

    const response = await PUT(requestEvent({ relays: ['wss://relay.example'] }, { pubkey: TEST_OWNER }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ relays: ['wss://relay.example/'] });

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.relays).toEqual(['wss://relay.example/']);
    expect(await valkey.get('identifier:' + TEST_NAME)).toBeNull();
  });

  it('returns a specific validation error for malformed relays', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });

    const response = await PUT(requestEvent({ relays: ['not-a-url'] }, { pubkey: TEST_OWNER }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('relay 1: not a valid URL');
  });
});
