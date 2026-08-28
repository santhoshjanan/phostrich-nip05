import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { getReservations, getStaleIdentifiers } from './adminQueries';

const STALE_NAME = 'admin-query-stale-test';
const FRESH_NAME = 'admin-query-fresh-test';
const RESERVED_NAME = 'admin-query-reserved-test';
// Seed-audited for this suite; no other integration file may reuse these owners.
const STALE_OWNER = '5101000000000000000000000000000000000000000000000000000000000000';
const FRESH_OWNER = '5102000000000000000000000000000000000000000000000000000000000000';

describe('getStaleIdentifiers', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, STALE_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, FRESH_NAME));
  });

  it('uses strict fixed-reference addition boundaries, including month-end and leap-year clamping', async () => {
    const august31 = new Date('2026-08-31T00:00:00.000Z');
    const leapAugust31 = new Date('2027-08-31T00:00:00.000Z');

    await db.insert(identifiers).values({
      name: STALE_NAME,
      status: 'claimed',
      ownerPubkey: STALE_OWNER,
      lastIdentifiedAt: august31
    });
    await db.insert(identifiers).values({
      name: FRESH_NAME,
      status: 'claimed',
      ownerPubkey: FRESH_OWNER,
      lastIdentifiedAt: leapAugust31
    });

    const ownedNamesAt = async (referenceTime: Date) =>
      (await getStaleIdentifiers(referenceTime))
        .map((row) => row.name)
        .filter((name) => name === STALE_NAME || name === FRESH_NAME);

    expect(await ownedNamesAt(new Date('2027-02-27T23:59:59.999Z'))).toEqual([]);
    expect(await ownedNamesAt(new Date('2027-02-28T00:00:00.000Z'))).toEqual([]);
    expect(await ownedNamesAt(new Date('2027-02-28T00:00:00.001Z'))).toEqual([STALE_NAME]);
    expect(await ownedNamesAt(new Date('2028-02-29T00:00:00.000Z'))).toEqual([STALE_NAME]);
    expect(await ownedNamesAt(new Date('2028-02-29T00:00:00.001Z'))).toEqual([
      STALE_NAME,
      FRESH_NAME
    ]);
  });
});

describe('getReservations', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, RESERVED_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, RESERVED_NAME));
  });

  it('returns reserved identifiers with their reason and actor', async () => {
    await db
      .insert(identifiers)
      .values({ name: RESERVED_NAME, status: 'reserved', ownerPubkey: null });
    await db.insert(identifierEvents).values({
      identifierName: RESERVED_NAME,
      eventType: 'reserved',
      actorPubkey: 'c'.repeat(64),
      reason: 'trademark hold'
    });

    const result = await getReservations();
    const row = result.find((r) => r.name === RESERVED_NAME);
    expect(row).toBeDefined();
    expect(row?.reason).toBe('trademark hold');
    expect(row?.actorPubkey).toBe('c'.repeat(64));
  });
});
