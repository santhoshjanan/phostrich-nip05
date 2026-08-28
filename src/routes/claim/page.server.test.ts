// src/routes/claim/+page.server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const TEST_NAME = 'claim-load-test';
const TEST_OWNER = '5'.repeat(64);

function loadEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as unknown as Parameters<typeof load>[0];
}

describe('claim page load', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('redirects to /login when unauthenticated', async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 302, location: '/login' });
  });

  it('redirects to /account when the user already owns a claimed identifier', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).rejects.toMatchObject({
      status: 302,
      location: '/account'
    });
  });

  it('does not redirect when authenticated with no existing identifier', async () => {
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).resolves.toBeUndefined();
  });
});
