import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { identifiers } from './schema';
import { valkey } from '../valkey';
import { resolveIdentifier, invalidateIdentifier, identifierNameExists } from './identifiers';

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

    await db
      .update(identifiers)
      .set({ ownerPubkey: 'e'.repeat(64) })
      .where(eq(identifiers.name, TEST_NAME));

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

  it('still returns the resolved result when the best-effort staleness-bump write fails', async () => {
    const staleDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: ['wss://relay.example'],
      lastIdentifiedAt: staleDate
    });

    // Force just the staleness-bump update to throw, without touching shared
    // test infra: spy on db.update for the duration of this test only, so
    // the update call inside resolveIdentifier rejects while everything else
    // (the select, the cache write) behaves normally.
    const updateSpy = vi.spyOn(db, 'update').mockImplementation(() => {
      throw new Error('simulated transient update failure');
    });

    try {
      const result = await resolveIdentifier(TEST_NAME);
      expect(result).toEqual({ pubkey: TEST_PUBKEY, relays: ['wss://relay.example'] });
    } finally {
      updateSpy.mockRestore();
    }
  });

  it('fails open to Postgres when the cache read throws', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: ['wss://relay.example']
    });

    const getSpy = vi.spyOn(valkey, 'get').mockImplementation(() => {
      throw new Error('simulated cache outage');
    });

    try {
      const result = await resolveIdentifier(TEST_NAME);
      expect(result).toEqual({ pubkey: TEST_PUBKEY, relays: ['wss://relay.example'] });
    } finally {
      getSpy.mockRestore();
    }
  });

  it('falls back to Postgres when the cached value is corrupt JSON', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: ['wss://relay.example']
    });
    await valkey.set('identifier:' + TEST_NAME, 'not-json', 'EX', 60);

    const result = await resolveIdentifier(TEST_NAME);
    expect(result).toEqual({ pubkey: TEST_PUBKEY, relays: ['wss://relay.example'] });
  });

  it('returns null from the negative cache on a repeated miss', async () => {
    const first = await resolveIdentifier(TEST_NAME);
    expect(first).toBeNull();

    const second = await resolveIdentifier(TEST_NAME);
    expect(second).toBeNull();
  });

  it('swallows a cache write failure on a successful resolve', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: ['wss://relay.example']
    });

    const setSpy = vi.spyOn(valkey, 'set').mockImplementation(() => {
      throw new Error('simulated cache write failure');
    });

    try {
      const result = await resolveIdentifier(TEST_NAME);
      expect(result).toEqual({ pubkey: TEST_PUBKEY, relays: ['wss://relay.example'] });
    } finally {
      setSpy.mockRestore();
    }
  });
});

describe('invalidateIdentifier', () => {
  const NAME = 'foundation-invalidate-test';

  afterEach(async () => {
    await valkey.del('identifier:' + NAME);
  });

  it('removes a cached entry', async () => {
    await valkey.set(
      'identifier:' + NAME,
      JSON.stringify({ pubkey: 'a'.repeat(64), relays: [] }),
      'EX',
      300
    );
    await invalidateIdentifier(NAME);
    expect(await valkey.get('identifier:' + NAME)).toBeNull();
  });

  it('does not throw when there is nothing cached', async () => {
    await invalidateIdentifier('never-cached-' + Date.now());
  });
});

describe('identifierNameExists', () => {
  const NAME = 'foundation-exists-test';

  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, NAME));
  });

  it('returns true for a row of any status, false when no row exists', async () => {
    await db.insert(identifiers).values({ name: NAME, status: 'reserved', ownerPubkey: null });
    expect(await identifierNameExists(NAME)).toBe(true);
    expect(await identifierNameExists('definitely-not-there-' + Date.now())).toBe(false);
  });
});
