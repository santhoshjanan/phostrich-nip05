import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { valkey } from '../valkey';
import { forceReleaseAdminIdentifier } from './adminForceRelease';

const ADMIN_PUBKEY = '0f'.repeat(32);
const TEST_NAME = 'admin-service-force-release';
const TEST_OWNER = '5408000000000000000000000000000000000000000000000000000000000000';
const CACHE_KEY = 'identifier:' + TEST_NAME;

describe('admin force-release service', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del(CACHE_KEY);
  });

  it('rejects a whitespace-only reason without changing row, event, or cache', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: new Date('2025-01-01T00:00:00.000Z')
    });
    await valkey.set(CACHE_KEY, 'cached', 'EX', 300);

    await expect(forceReleaseAdminIdentifier(ADMIN_PUBKEY, TEST_NAME, '   ')).resolves.toEqual({
      ok: false,
      reason: 'reason_required'
    });
    expect(await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME))).toHaveLength(
      1
    );
    expect(
      await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME))
    ).toHaveLength(0);
    expect(await valkey.get(CACHE_KEY)).toBe('cached');
  });

  it('reports a fresh claimed row as not eligible without auditing it', async () => {
    const lastIdentifiedAt = new Date();
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt
    });

    await expect(forceReleaseAdminIdentifier(ADMIN_PUBKEY, TEST_NAME, 'reason')).resolves.toEqual({
      ok: false,
      reason: 'not_eligible',
      lastIdentifiedAt
    });
    expect(
      await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME))
    ).toHaveLength(0);
  });

  it('reports a missing identifier', async () => {
    await expect(forceReleaseAdminIdentifier(ADMIN_PUBKEY, TEST_NAME, 'reason')).resolves.toEqual({
      ok: false,
      reason: 'not_found'
    });
  });

  it('atomically releases stale data, trims the audit reason, and invalidates cache', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: new Date('2025-01-01T00:00:00.000Z')
    });
    await valkey.set(CACHE_KEY, 'cached', 'EX', 300);

    await expect(
      forceReleaseAdminIdentifier(ADMIN_PUBKEY, TEST_NAME, '  reported impersonation  ')
    ).resolves.toEqual({
      ok: true,
      name: TEST_NAME,
      reason: 'reported impersonation'
    });

    expect(await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME))).toHaveLength(
      0
    );
    const events = await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'force_released',
      actorPubkey: ADMIN_PUBKEY,
      reason: 'reported impersonation'
    });
    expect(await valkey.get(CACHE_KEY)).toBeNull();
  });
});
