import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { POST } from './+server';

const ADMIN_PUBKEY = '0f'.repeat(32);
const NON_ADMIN_PUBKEY = 'd'.repeat(64);
const TEST_NAME = 'admin-reservation-test';
const CLAIMED_OWNER = '5202000000000000000000000000000000000000000000000000000000000000';

function requestEvent(body: unknown, user: { pubkey: string } | null) {
  return {
    request: new Request('https://phostrich.test/api/admin/reservations', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/admin/reservations', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, null));
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: NON_ADMIN_PUBKEY })
    );
    expect(response.status).toBe(403);
  });

  it('maps a created reservation to its normalized response', async () => {
    const response = await POST(
      requestEvent(
        { name: TEST_NAME.toUpperCase(), reason: '  trademark hold  ' },
        { pubkey: ADMIN_PUBKEY }
      )
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      name: TEST_NAME,
      reason: 'trademark hold',
      actorPubkey: ADMIN_PUBKEY,
      createdAt: expect.any(String)
    });
  });

  it('returns 400 when reason is whitespace-only', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: '   ' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'reason_required' });
  });

  it('returns 409 when the name is already claimed', async () => {
    await db
      .insert(identifiers)
      .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: CLAIMED_OWNER });
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'name_claimed' });
  });
});
