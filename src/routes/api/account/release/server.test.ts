import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { POST } from './+server';

const TEST_NAME = 'release-route-test';
const TEST_OWNER = '8'.repeat(64);
const RECLAIMED_NAME = 'release-route-reclaimed-test';
const FORMER_OWNER = '1'.repeat(64);
const NEW_OWNER = 'ef'.repeat(32);

function requestEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as Parameters<typeof POST>[0];
}

describe('POST /api/account/release', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, RECLAIMED_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, RECLAIMED_NAME));
  });

  it('rejects unauthenticated requests', async () => {
    const response = await POST(requestEvent(null));

    expect(response.status).toBe(401);
  });

  it('returns not found when the caller owns no claimed identifier', async () => {
    const response = await POST(requestEvent({ pubkey: TEST_OWNER }));

    expect(response.status).toBe(404);
  });

  it('returns an ok response after releasing an owned identifier', async () => {
    await db
      .insert(identifiers)
      .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });

    const response = await POST(requestEvent({ pubkey: TEST_OWNER }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('returns not found without deleting an identifier reclaimed by another owner', async () => {
    await db.insert(identifiers).values({
      name: RECLAIMED_NAME,
      status: 'claimed',
      ownerPubkey: NEW_OWNER
    });

    const response = await POST(requestEvent({ pubkey: FORMER_OWNER }));

    expect(response.status).toBe(404);
    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, RECLAIMED_NAME));
    expect(row.ownerPubkey).toBe(NEW_OWNER);
  });
});
