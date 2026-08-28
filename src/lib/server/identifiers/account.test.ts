import { afterEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { valkey } from '../valkey';
import { releaseOwnedIdentifier, saveOwnedRelays } from './account';

const OLD_OWNER = '1'.repeat(64);
const NEW_OWNER = '2'.repeat(64);
const RELAY_NAME = 'account-service-relays-test';
const RELEASE_NAME = 'account-service-release-test';

describe('account identifier service', () => {
  afterEach(async () => {
    await db
      .delete(identifierEvents)
      .where(inArray(identifierEvents.identifierName, [RELAY_NAME, RELEASE_NAME]));
    await db.delete(identifiers).where(inArray(identifiers.name, [RELAY_NAME, RELEASE_NAME]));
    await valkey.del('identifier:' + RELAY_NAME, 'identifier:' + RELEASE_NAME);
  });

  it('does not change a reclaimed identifier when a former owner saves relays', async () => {
    await db.insert(identifiers).values({
      name: RELAY_NAME,
      status: 'claimed',
      ownerPubkey: NEW_OWNER,
      relays: ['wss://new-owner.example/']
    });
    await valkey.set(
      'identifier:' + RELAY_NAME,
      JSON.stringify({ pubkey: NEW_OWNER, relays: ['wss://new-owner.example/'] }),
      'EX',
      300
    );

    await expect(
      saveOwnedRelays(OLD_OWNER, ['wss://former-owner.example'], { allowInsecure: false })
    ).resolves.toEqual({ ok: false, reason: 'not_found' });

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, RELAY_NAME));
    expect(row).toMatchObject({ ownerPubkey: NEW_OWNER, relays: ['wss://new-owner.example/'] });
    expect(await valkey.get('identifier:' + RELAY_NAME)).not.toBeNull();
  });

  it('does not delete or audit a reclaimed identifier for a former owner', async () => {
    await db.insert(identifiers).values({
      name: RELEASE_NAME,
      status: 'claimed',
      ownerPubkey: NEW_OWNER
    });

    await expect(releaseOwnedIdentifier(OLD_OWNER)).resolves.toEqual({
      ok: false,
      reason: 'not_found'
    });

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, RELEASE_NAME));
    expect(row.ownerPubkey).toBe(NEW_OWNER);
    expect(
      await db
        .select()
        .from(identifierEvents)
        .where(
          and(
            eq(identifierEvents.identifierName, RELEASE_NAME),
            eq(identifierEvents.actorPubkey, OLD_OWNER)
          )
        )
    ).toHaveLength(0);
  });

  it('deletes an owned identifier and records one released event', async () => {
    await db.insert(identifiers).values({
      name: RELEASE_NAME,
      status: 'claimed',
      ownerPubkey: OLD_OWNER
    });

    await expect(releaseOwnedIdentifier(OLD_OWNER)).resolves.toEqual({
      ok: true,
      name: RELEASE_NAME
    });
    expect(
      await db.select().from(identifiers).where(eq(identifiers.name, RELEASE_NAME))
    ).toHaveLength(0);
    const events = await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, RELEASE_NAME));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'released',
      actorPubkey: OLD_OWNER,
      reason: null
    });
  });
});
