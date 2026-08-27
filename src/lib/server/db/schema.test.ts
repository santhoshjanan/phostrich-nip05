// src/lib/server/db/schema.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { identifiers } from './schema';

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
