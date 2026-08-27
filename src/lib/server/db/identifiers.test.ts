import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { identifiers } from './schema';
import { valkey } from '../valkey';
import { resolveIdentifier } from './identifiers';

const TEST_NAME = 'foundation-resolve-test';
const TEST_PUBKEY = 'd'.repeat(64);

describe('resolveIdentifier', () => {
  beforeEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('returns null when the name does not exist', async () => {
    const result = await resolveIdentifier(TEST_NAME);
    expect(result).toBeNull();
  });

  it('negative-caches a miss so the marker is stored', async () => {
    await resolveIdentifier(TEST_NAME);
    const cached = await valkey.get('identifier:' + TEST_NAME);
    expect(cached).toBe('__miss__');
  });

  it('resolves a claimed identifier from Postgres and populates the cache', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: ['wss://relay.example']
    });

    const result = await resolveIdentifier(TEST_NAME);
    expect(result).toEqual({ pubkey: TEST_PUBKEY, relays: ['wss://relay.example'] });

    const cached = await valkey.get('identifier:' + TEST_NAME);
    expect(cached).toBe(JSON.stringify({ pubkey: TEST_PUBKEY, relays: ['wss://relay.example'] }));
  });

  it('serves a cache hit without re-reading a changed row from Postgres', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: []
    });
    await resolveIdentifier(TEST_NAME); // populates cache

    await db.update(identifiers).set({ ownerPubkey: 'e'.repeat(64) }).where(eq(identifiers.name, TEST_NAME));

    const result = await resolveIdentifier(TEST_NAME);
    expect(result?.pubkey).toBe(TEST_PUBKEY); // still the cached value
  });

  it('never resolves a reserved or blocked identifier', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'reserved',
      ownerPubkey: null
    });

    const result = await resolveIdentifier(TEST_NAME);
    expect(result).toBeNull();
  });

  it('lazily bumps last_identified_at when the stored value is more than a day old', async () => {
    const staleDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      lastIdentifiedAt: staleDate
    });

    await resolveIdentifier(TEST_NAME);

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.lastIdentifiedAt.getTime()).toBeGreaterThan(staleDate.getTime());
  });

  it('does not rewrite last_identified_at when it is already fresh', async () => {
    const freshDate = new Date();
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      lastIdentifiedAt: freshDate
    });

    await resolveIdentifier(TEST_NAME);

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.lastIdentifiedAt.getTime()).toBe(freshDate.getTime());
  });
});
