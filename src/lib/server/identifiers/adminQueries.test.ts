import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { getReservations, getStaleIdentifiers } from './adminQueries';

const STALE_NAME = 'admin-query-stale-test';
const FRESH_NAME = 'admin-query-fresh-test';
const RESERVED_NAME = 'admin-query-reserved-test';
const ORDER_ALPHA_NAME = 'admin-query-order-alpha';
const ORDER_BETA_NAME = 'admin-query-order-beta';
// Seed-audited for this suite; no other integration file may reuse these owners.
const STALE_OWNER = '5101000000000000000000000000000000000000000000000000000000000000';
const FRESH_OWNER = '5102000000000000000000000000000000000000000000000000000000000000';

describe('getStaleIdentifiers', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, STALE_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, FRESH_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, ORDER_ALPHA_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, ORDER_BETA_NAME));
  });

  it('orders names ascending when stale lookup timestamps are tied', async () => {
    const staleAt = new Date('2025-01-01T00:00:00.000Z');
    await db.insert(identifiers).values([
      {
        name: ORDER_BETA_NAME,
        status: 'claimed',
        ownerPubkey: '5103000000000000000000000000000000000000000000000000000000000000',
        lastIdentifiedAt: staleAt
      },
      {
        name: ORDER_ALPHA_NAME,
        status: 'claimed',
        ownerPubkey: '5104000000000000000000000000000000000000000000000000000000000000',
        lastIdentifiedAt: staleAt
      }
    ]);

    const names = (await getStaleIdentifiers(new Date('2026-01-01T00:00:00.000Z')))
      .map((row) => row.name)
      .filter((name) => name === ORDER_ALPHA_NAME || name === ORDER_BETA_NAME);

    expect(names).toEqual([ORDER_ALPHA_NAME, ORDER_BETA_NAME]);
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

  it('uses the later event ID when reserved events share a createdAt timestamp', async () => {
    const createdAt = new Date('2026-08-31T00:00:00.000Z');
    await db
      .insert(identifiers)
      .values({ name: RESERVED_NAME, status: 'reserved', ownerPubkey: null });
    await db.insert(identifierEvents).values({
      identifierName: RESERVED_NAME,
      eventType: 'reserved',
      actorPubkey: 'a'.repeat(64),
      reason: 'initial hold',
      createdAt
    });
    await db.insert(identifierEvents).values({
      identifierName: RESERVED_NAME,
      eventType: 'reserved',
      actorPubkey: 'b'.repeat(64),
      reason: 'updated hold',
      createdAt
    });

    const result = await getReservations();
    const row = result.find((r) => r.name === RESERVED_NAME);
    expect(row?.reason).toBe('updated hold');
    expect(row?.actorPubkey).toBe('b'.repeat(64));
  });

  it('retrieves recreated reservation metadata with one deterministic database select', async () => {
    const createdAt = new Date('2026-08-31T00:00:00.000Z');
    await db
      .insert(identifiers)
      .values({ name: RESERVED_NAME, status: 'reserved', ownerPubkey: null });
    await db.insert(identifierEvents).values({
      identifierName: RESERVED_NAME,
      eventType: 'reserved',
      actorPubkey: 'a'.repeat(64),
      reason: 'old reservation',
      createdAt
    });
    await db.delete(identifiers).where(eq(identifiers.name, RESERVED_NAME));
    await db
      .insert(identifiers)
      .values({ name: RESERVED_NAME, status: 'reserved', ownerPubkey: null });
    await db.insert(identifierEvents).values({
      identifierName: RESERVED_NAME,
      eventType: 'reserved',
      actorPubkey: 'b'.repeat(64),
      reason: 'recreated reservation',
      createdAt
    });

    const select = vi.spyOn(db, 'select');
    const result = await getReservations();
    const row = result.find((reservation) => reservation.name === RESERVED_NAME);

    expect(row?.reason).toBe('recreated reservation');
    expect(row?.actorPubkey).toBe('b'.repeat(64));
    expect(select).toHaveBeenCalledTimes(1);
    select.mockRestore();
  });
});
