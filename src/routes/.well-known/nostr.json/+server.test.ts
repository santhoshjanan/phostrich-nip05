import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET } from './+server';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { config } from '$lib/server/config';

const TEST_NAME = 'foundation-route-test';
const TEST_PUBKEY = 'f'.repeat(64);

function requestEvent(name: string | null) {
  const url = new URL('https://phostrich.test/.well-known/nostr.json');
  if (name !== null) url.searchParams.set('name', name);
  return { url } as unknown as Parameters<typeof GET>[0];
}

describe('GET /.well-known/nostr.json', () => {
  beforeEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('returns an empty names object and the CORS header when name is missing', async () => {
    const response = await GET(requestEvent(null));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({ names: {} });
  });

  it('returns 200 with an empty names object for an unknown name', async () => {
    const response = await GET(requestEvent('nobody-claimed-this'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ names: {} });
  });

  it('returns 200 with an empty names object for a name with invalid characters', async () => {
    const response = await GET(requestEvent('bad name!'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ names: {} });
  });

  it('resolves a claimed identifier case-insensitively', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: ['wss://relay.example']
    });

    const response = await GET(requestEvent(TEST_NAME.toUpperCase()));
    const body = await response.json();
    expect(body.names[TEST_NAME]).toBe(TEST_PUBKEY);
    expect(body.relays[TEST_PUBKEY]).toEqual(['wss://relay.example']);
  });

  it('falls back to DEFAULT_RELAYS when the identifier has none set', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: []
    });

    const response = await GET(requestEvent(TEST_NAME));
    const body = await response.json();
    expect(body.relays[TEST_PUBKEY]).toEqual(config.DEFAULT_RELAYS);
  });
});
