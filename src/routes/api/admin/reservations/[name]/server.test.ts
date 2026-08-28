import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { DELETE } from './+server';

const ADMIN_PUBKEY = '0f'.repeat(32);
const NON_ADMIN_PUBKEY = 'd'.repeat(64);
const TEST_NAME = 'admin-reservation-delete-test';
const CLAIMED_OWNER = '5301000000000000000000000000000000000000000000000000000000000000';

function requestEvent(name: string, user: { pubkey: string } | null) {
  return { params: { name }, locals: { user } } as unknown as Parameters<typeof DELETE>[0];
}

describe('DELETE /api/admin/reservations/[name]', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await DELETE(requestEvent(TEST_NAME, null));
    expect(response.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: NON_ADMIN_PUBKEY }));
    expect(response.status).toBe(403);
  });

  it('returns 404 when there is no matching reserved row', async () => {
    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(404);
  });

  it('never deletes a claimed row', async () => {
    await db
      .insert(identifiers)
      .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: CLAIMED_OWNER });
    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(404);
  });

  it('maps a successful service removal to 200', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'reserved', ownerPubkey: null });

    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
