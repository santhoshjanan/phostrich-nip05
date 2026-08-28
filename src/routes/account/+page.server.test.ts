import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const TEST_NAME = 'account-load-test';
const TEST_OWNER = '9'.repeat(64);

function loadEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as Parameters<typeof load>[0];
}

describe('account page load', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('redirects unauthenticated visitors to login', async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 302, location: '/login' });
  });

  it('redirects owners without an identifier to claim', async () => {
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).rejects.toMatchObject({
      status: 302,
      location: '/claim'
    });
  });

  it('returns the owned identifier and its account data', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      relays: ['wss://relay.example']
    });

    const result = await load(loadEvent({ pubkey: TEST_OWNER }));

    expect(result.name).toBe(TEST_NAME);
    expect(result.relays).toEqual(['wss://relay.example']);
    expect(typeof result.lastIdentifiedAt).toBe('string');
  });
});
