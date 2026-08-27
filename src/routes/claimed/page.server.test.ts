import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const TEST_NAME = 'claimed-load-test';
const TEST_OWNER = '6'.repeat(64);

function loadEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as unknown as Parameters<typeof load>[0];
}

describe('claimed page load', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('redirects to /login when unauthenticated', async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 302, location: '/login' });
  });

  it('redirects to /claim when the user owns no claimed identifier', async () => {
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).rejects.toMatchObject({ status: 302, location: '/claim' });
  });

  it('returns the identifier string when the user owns one', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    const result = await load(loadEvent({ pubkey: TEST_OWNER }));
    expect(result.identifier).toContain(TEST_NAME + '@');
  });
});
