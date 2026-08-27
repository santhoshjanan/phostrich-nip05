import { describe, expect, it } from 'vitest';
import { valkey } from '../valkey';
import { createSession, destroySession, getSession } from './session';

const TEST_PUBKEY = '3'.repeat(64);

describe('session store', () => {
  it('creates a session that can be looked up', async () => {
    const sessionId = await createSession(TEST_PUBKEY);
    try {
      const session = await getSession(sessionId);
      expect(session).toEqual({ pubkey: TEST_PUBKEY });
    } finally {
      await destroySession(sessionId);
    }
  });

  it('returns null for an unknown session id', async () => {
    const session = await getSession('nonexistent');
    expect(session).toBeNull();
  });

  it('refreshes the TTL on lookup', async () => {
    const sessionId = await createSession(TEST_PUBKEY);
    try {
      const initialTtl = await valkey.ttl('session:' + sessionId);
      expect(initialTtl).toBeGreaterThan(10);

      await valkey.expire('session:' + sessionId, 10); // simulate a near-expired session
      await getSession(sessionId);

      const refreshedTtl = await valkey.ttl('session:' + sessionId);
      expect(refreshedTtl).toBeGreaterThan(10);
    } finally {
      await destroySession(sessionId);
    }
  });

  it('destroy removes the session so lookup returns null', async () => {
    const sessionId = await createSession(TEST_PUBKEY);
    await destroySession(sessionId);
    const session = await getSession(sessionId);
    expect(session).toBeNull();
  });
});
