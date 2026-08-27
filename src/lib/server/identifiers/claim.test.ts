import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { valkey } from '../valkey';
import { claimIdentifier } from './claim';

const TEST_NAME = 'claim-test-name';
const TEST_OWNER = '1'.repeat(64);

describe('claimIdentifier', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('claims an available name, writes an audit row, and invalidates the cache', async () => {
    await valkey.set('identifier:' + TEST_NAME, '__miss__', 'EX', 30);

    const result = await claimIdentifier(TEST_NAME, TEST_OWNER);
    expect(result).toEqual({ ok: true });

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.ownerPubkey).toBe(TEST_OWNER);

    const [event] = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(event.eventType).toBe('claimed');
    expect(event.actorPubkey).toBe(TEST_OWNER);

    expect(await valkey.get('identifier:' + TEST_NAME)).toBeNull();
  });

  it('rejects an invalid name format without touching the database', async () => {
    const result = await claimIdentifier('Not Valid!', TEST_OWNER);
    expect(result).toEqual({ ok: false, reason: 'invalid_name' });
  });

  it('rejects a name that is already taken', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: '2'.repeat(64) });
    const result = await claimIdentifier(TEST_NAME, TEST_OWNER);
    expect(result).toEqual({ ok: false, reason: 'name_taken' });
  });

  it('rejects a second claim by an owner who already has one', async () => {
    const otherName = 'claim-test-existing';
    await db.insert(identifiers).values({ name: otherName, status: 'claimed', ownerPubkey: TEST_OWNER });

    try {
      const result = await claimIdentifier(TEST_NAME, TEST_OWNER);
      expect(result).toEqual({ ok: false, reason: 'owner_cap' });
    } finally {
      await db.delete(identifiers).where(eq(identifiers.name, otherName));
    }
  });
});
