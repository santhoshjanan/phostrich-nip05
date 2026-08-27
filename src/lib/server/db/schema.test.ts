// src/lib/server/db/schema.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from './index';
import { identifiers, identifierEvents } from './schema';

const TEST_NAME = 'foundation-schema-smoke-test';

describe('identifiers schema', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('inserts and reads back a row matching the migrated table shape', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: 'a'.repeat(64),
      relays: ['wss://relay.example']
    });

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.status).toBe('claimed');
    expect(row.ownerPubkey).toBe('a'.repeat(64));
    expect(row.relays).toEqual(['wss://relay.example']);
  });

  it('rejects a second row with the same name', async () => {
    await db
      .insert(identifiers)
      .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: 'a'.repeat(64) });
    await expect(
      db
        .insert(identifiers)
        .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: 'b'.repeat(64) })
    ).rejects.toThrow();
  });
});

describe('one identifier per owner', () => {
  afterEach(async () => {
    await db
      .delete(identifiers)
      .where(
        inArray(identifiers.name, [
          'owner-cap-test-1',
          'owner-cap-test-2',
          'owner-cap-test-3',
          'owner-cap-test-4'
        ])
      );
  });

  it('rejects a second claimed row for the same owner_pubkey', async () => {
    const owner = 'f'.repeat(64);
    await db.insert(identifiers).values({ name: 'owner-cap-test-1', status: 'claimed', ownerPubkey: owner });
    await expect(
      db.insert(identifiers).values({ name: 'owner-cap-test-2', status: 'claimed', ownerPubkey: owner })
    ).rejects.toThrow();
  });

  it('allows the same owner_pubkey on a non-claimed row', async () => {
    const owner = 'e'.repeat(64);
    await db.insert(identifiers).values({ name: 'owner-cap-test-3', status: 'claimed', ownerPubkey: owner });
    await db.insert(identifiers).values({ name: 'owner-cap-test-4', status: 'reserved', ownerPubkey: owner });
  });
});

describe('identifier_events', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, 'never-existed'));
  });

  it('inserts a row without requiring the identifier to still exist', async () => {
    await db.insert(identifierEvents).values({
      identifierName: 'never-existed',
      eventType: 'claimed',
      actorPubkey: 'a'.repeat(64)
    });
    const [row] = await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, 'never-existed'));
    expect(row.eventType).toBe('claimed');
  });
});
