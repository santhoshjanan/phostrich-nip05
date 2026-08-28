import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { POST } from './+server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const NON_ADMIN_PUBKEY = 'e'.repeat(64);
const TEST_NAME = 'admin-force-release-test';
const TEST_OWNER = '5409000000000000000000000000000000000000000000000000000000000000';

function requestEvent(body: unknown, user: { pubkey: string } | null) {
  return {
    request: new Request('https://phostrich.test/api/admin/force-release', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/admin/force-release', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, null));
    expect(response.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: NON_ADMIN_PUBKEY })
    );
    expect(response.status).toBe(403);
  });

  it('returns 404 when the identifier does not exist', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 when reason is whitespace-only', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: '   ' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'reason_required' });
  });

  it('returns 409 when the identifier is not actually stale', async () => {
    await db
      .insert(identifiers)
      .values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(409);
  });

  it('maps a genuinely stale identifier to a successful response', async () => {
    const staleAt = new Date('2025-01-01T00:00:00.000Z');
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: staleAt
    });
    const response = await POST(
      requestEvent(
        { name: TEST_NAME, reason: '  reported impersonation  ' },
        { pubkey: ADMIN_PUBKEY }
      )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
