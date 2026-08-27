import { describe, expect, it } from 'vitest';
import { createSession, getSession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { POST } from './+server';

const TEST_PUBKEY = '7'.repeat(64);

function requestEvent(cookieValue: string | undefined) {
  const store = new Map<string, string>();
  if (cookieValue !== undefined) store.set(SESSION_COOKIE_NAME, cookieValue);
  const deleted: string[] = [];

  const event = {
    cookies: {
      get: (name: string) => store.get(name),
      delete: (name: string) => {
        deleted.push(name);
        store.delete(name);
      }
    }
  };
  return { event, deleted };
}

describe('POST /auth/logout', () => {
  it('destroys the session and clears the cookie', async () => {
    const sessionId = await createSession(TEST_PUBKEY);
    const { event, deleted } = requestEvent(sessionId);

    const response = await POST(event as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(200);
    expect(deleted).toContain(SESSION_COOKIE_NAME);

    const session = await getSession(sessionId);
    expect(session).toBeNull();
  });

  it('is a no-op (still 200) when there is no session cookie', async () => {
    const { event } = requestEvent(undefined);
    const response = await POST(event as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(200);
  });
});
