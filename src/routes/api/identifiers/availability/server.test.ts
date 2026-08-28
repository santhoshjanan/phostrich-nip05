import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { GET } from './+server';

const TEST_IP = '127.0.0.2';
const TEST_NAME = 'availability-test-name';

function requestEvent(name: string, ip = TEST_IP) {
  const url = new URL('https://phostrich.test/api/identifiers/availability');
  url.searchParams.set('name', name);
  return { url, getClientAddress: () => ip } as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/identifiers/availability', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('ratelimit:availability:ip:' + TEST_IP);
  });

  it('returns available: true for an unused, well-formed name', async () => {
    const response = await GET(requestEvent(TEST_NAME));
    expect(await response.json()).toEqual({ available: true });
  });

  it('returns available: false for a name that already has a row, regardless of status', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'reserved', ownerPubkey: null });
    const response = await GET(requestEvent(TEST_NAME));
    expect(await response.json()).toEqual({ available: false });
  });

  it('returns available: false for a malformed name without a 400', async () => {
    const response = await GET(requestEvent('Not Valid!'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false });
  });

  it('returns available: false for a reserved-pattern name with no DB row', async () => {
    const response = await GET(requestEvent('admin'));
    expect(await response.json()).toEqual({ available: false });
  });

  it('returns 429 once the per-IP rate limit is exceeded', async () => {
    const ip = '127.0.0.9';
    await valkey.del('ratelimit:availability:ip:' + ip);
    try {
      for (let i = 0; i < 60; i++) {
        const resp = await GET(requestEvent(TEST_NAME, ip));
        expect(resp.status).toBe(200);
      }
      const response = await GET(requestEvent(TEST_NAME, ip));
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: 'rate limited' });
    } finally {
      await valkey.del('ratelimit:availability:ip:' + ip);
    }
  });
});
