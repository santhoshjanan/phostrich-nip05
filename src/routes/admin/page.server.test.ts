import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const NON_ADMIN_PUBKEY = '1'.repeat(64);
const TEST_NAME = 'admin-page-load-test';
const TEST_RESERVATION_NAME = 'admin-page-reservation-test';
const TEST_OWNER = '5501000000000000000000000000000000000000000000000000000000000000';

function loadEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as unknown as Parameters<typeof load>[0];
}

describe('admin page load', () => {
  afterEach(async () => {
    await db
      .delete(identifierEvents)
      .where(eq(identifierEvents.identifierName, TEST_RESERVATION_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_RESERVATION_NAME));
  });

  it('redirects to /login when unauthenticated', async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 302, location: '/login' });
  });

  it('returns 403 for a non-admin', async () => {
    await expect(load(loadEvent({ pubkey: NON_ADMIN_PUBKEY }))).rejects.toMatchObject({
      status: 403
    });
  });

  it('returns stale and reservation lists for an admin with serialized dates', async () => {
    const staleAt = new Date('2025-01-01T00:00:00.000Z');
    const reservedAt = new Date('2026-01-01T00:00:00.000Z');
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: staleAt
    });
    await db.insert(identifiers).values({
      name: TEST_RESERVATION_NAME,
      status: 'reserved',
      createdAt: reservedAt
    });
    await db.insert(identifierEvents).values({
      identifierName: TEST_RESERVATION_NAME,
      eventType: 'reserved',
      actorPubkey: ADMIN_PUBKEY,
      reason: 'test reservation',
      createdAt: reservedAt
    });

    const result = await load(loadEvent({ pubkey: ADMIN_PUBKEY }));
    const stale = result.stale.find((s) => s.name === TEST_NAME);
    const reservation = result.reservations.find((r) => r.name === TEST_RESERVATION_NAME);

    expect(stale).toMatchObject({
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: staleAt.toISOString()
    });
    expect(reservation).toMatchObject({
      reason: 'test reservation',
      actorPubkey: ADMIN_PUBKEY,
      createdAt: reservedAt.toISOString()
    });
  });
});
