import { afterEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { createAdminReservation, removeAdminReservation } from './adminReservations';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const CREATE_NAME = 'admin-reservation-create';
const CLAIMED_NAME = 'admin-reservation-claimed';
const CLAIMED_OWNER = '5201000000000000000000000000000000000000000000000000000000000000';
const REMOVE_NAME = 'admin-service-reservation-remove';
const REMOVE_CLAIMED_NAME = 'admin-service-reservation-remove-claimed';
const REMOVE_OWNER = '5203000000000000000000000000000000000000000000000000000000000000';
const FIXTURE_NAMES = [CREATE_NAME, CLAIMED_NAME, REMOVE_NAME, REMOVE_CLAIMED_NAME];

describe('admin reservation service', () => {
  afterEach(async () => {
    await db
      .delete(identifierEvents)
      .where(inArray(identifierEvents.identifierName, FIXTURE_NAMES));
    await db.delete(identifiers).where(inArray(identifiers.name, FIXTURE_NAMES));
  });

  it('rejects a whitespace-only reservation reason without writing rows', async () => {
    await expect(createAdminReservation(ADMIN_PUBKEY, CREATE_NAME, '   ')).resolves.toEqual({
      ok: false,
      reason: 'reason_required'
    });
    expect(
      await db.select().from(identifiers).where(eq(identifiers.name, CREATE_NAME))
    ).toHaveLength(0);
  });

  it('persists the trimmed reservation reason in the same transaction as the row', async () => {
    await expect(
      createAdminReservation(ADMIN_PUBKEY, CREATE_NAME.toUpperCase(), '  trademark hold  ')
    ).resolves.toEqual({
      ok: true,
      name: CREATE_NAME,
      reason: 'trademark hold',
      actorPubkey: ADMIN_PUBKEY,
      createdAt: expect.any(Date)
    });

    const [event] = await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, CREATE_NAME));
    expect(event).toMatchObject({
      eventType: 'reserved',
      actorPubkey: ADMIN_PUBKEY,
      reason: 'trademark hold'
    });
  });

  it('rejects an invalid identifier name', async () => {
    await expect(createAdminReservation(ADMIN_PUBKEY, 'bad name', 'reason')).resolves.toEqual({
      ok: false,
      reason: 'invalid_name'
    });
  });

  it('reports claimed and reserved conflicts distinctly', async () => {
    await db.insert(identifiers).values({
      name: CLAIMED_NAME,
      status: 'claimed',
      ownerPubkey: CLAIMED_OWNER
    });
    await db.insert(identifiers).values({
      name: CREATE_NAME,
      status: 'reserved',
      ownerPubkey: null
    });

    await expect(createAdminReservation(ADMIN_PUBKEY, CLAIMED_NAME, 'reason')).resolves.toEqual({
      ok: false,
      reason: 'name_claimed'
    });
    await expect(createAdminReservation(ADMIN_PUBKEY, CREATE_NAME, 'reason')).resolves.toEqual({
      ok: false,
      reason: 'name_already_reserved'
    });
  });

  it('does not remove or audit a claimed row', async () => {
    await db.insert(identifiers).values({
      name: REMOVE_CLAIMED_NAME,
      status: 'claimed',
      ownerPubkey: REMOVE_OWNER
    });

    await expect(removeAdminReservation(ADMIN_PUBKEY, REMOVE_CLAIMED_NAME)).resolves.toEqual({
      ok: false,
      reason: 'not_found'
    });
    expect(
      await db.select().from(identifiers).where(eq(identifiers.name, REMOVE_CLAIMED_NAME))
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(identifierEvents)
        .where(eq(identifierEvents.identifierName, REMOVE_CLAIMED_NAME))
    ).toHaveLength(0);
  });

  it('removes a reserved row and writes exactly one audit event', async () => {
    await db.insert(identifiers).values({
      name: REMOVE_NAME,
      status: 'reserved',
      ownerPubkey: null
    });

    await expect(removeAdminReservation(ADMIN_PUBKEY, REMOVE_NAME)).resolves.toEqual({
      ok: true,
      name: REMOVE_NAME
    });
    expect(
      await db.select().from(identifiers).where(eq(identifiers.name, REMOVE_NAME))
    ).toHaveLength(0);
    const events = await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, REMOVE_NAME));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'reservation_removed',
      actorPubkey: ADMIN_PUBKEY,
      reason: null
    });
  });
});
