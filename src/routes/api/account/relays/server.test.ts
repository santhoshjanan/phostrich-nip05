import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { PUT } from './+server';

const TEST_NAME = 'relays-route-test';
const TEST_OWNER = 'f'.repeat(64);
const RECLAIMED_NAME = 'relays-route-reclaimed-test';
const FORMER_OWNER = '1'.repeat(64);
const NEW_OWNER = 'de'.repeat(32);

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
    await db.delete(identifiers).where(eq(identifiers.name, RECLAIMED_NAME));
  });

  it('rejects unauthenticated requests', async () => {
    const response = await PUT(requestEvent({ relays: [] }, null));

    expect(response.status).toBe(401);
  });

  it('returns not found when the caller owns no claimed identifier', async () => {
    const response = await PUT(requestEvent({ relays: [] }, { pubkey: TEST_OWNER }));

    expect(response.status).toBe(404);
  });

  it('rejects a request whose relays are not an array of strings', async () => {
    const response = await PUT(
      requestEvent({ relays: ['wss://relay.example', 1] }, { pubkey: TEST_OWNER })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_relays' });
  });

  it('returns normalized relays after saving them', async () => {
    await db
      .insert(identifiers)
      .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER, relays: [] });

    const response = await PUT(
      requestEvent({ relays: ['wss://relay.example'] }, { pubkey: TEST_OWNER })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ relays: ['wss://relay.example/'] });
  });

  it('returns a specific validation error for malformed relays', async () => {
    await db
      .insert(identifiers)
      .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });

    const response = await PUT(requestEvent({ relays: ['not-a-url'] }, { pubkey: TEST_OWNER }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('relay 1: not a valid URL');
  });

  it('returns not found without changing an identifier reclaimed by another owner', async () => {
    await db.insert(identifiers).values({
      name: RECLAIMED_NAME,
      status: 'claimed',
      ownerPubkey: NEW_OWNER,
      relays: ['wss://new-owner.example/']
    });

    const response = await PUT(
      requestEvent({ relays: ['wss://former-owner.example'] }, { pubkey: FORMER_OWNER })
    );

    expect(response.status).toBe(404);
    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, RECLAIMED_NAME));
    expect(row).toMatchObject({ ownerPubkey: NEW_OWNER, relays: ['wss://new-owner.example/'] });
  });
});
