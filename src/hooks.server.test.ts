// src/hooks.server.test.ts
import { describe, expect, it } from 'vitest';
import { handle } from './hooks.server';
import { createSession, destroySession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';

const TEST_PUBKEY = '4'.repeat(64);

function fakeEvent(cookieValue: string | undefined) {
  const store = new Map<string, string>();
  if (cookieValue !== undefined) store.set(SESSION_COOKIE_NAME, cookieValue);

  const locals: { user: { pubkey: string } | null } = { user: null };
  const deleted: string[] = [];

  const event = {
    cookies: {
      get: (name: string) => store.get(name),
      delete: (name: string) => {
        deleted.push(name);
        store.delete(name);
      }
    },
    locals
  };

  return { event, deleted, locals };
}

describe('handle', () => {
  it('sets locals.user for a valid session cookie', async () => {
    const sessionId = await createSession(TEST_PUBKEY);
    try {
      const { event, locals } = fakeEvent(sessionId);
      await handle({
        event: event as unknown as Parameters<typeof handle>[0]['event'],
        resolve: async () => new Response()
      } as Parameters<typeof handle>[0]);
      expect(locals.user).toEqual({ pubkey: TEST_PUBKEY });
    } finally {
      await destroySession(sessionId);
    }
  });

  it('sets locals.user to null and clears the cookie for an invalid session id', async () => {
    const { event, locals, deleted } = fakeEvent('not-a-real-session');
    await handle({
      event: event as unknown as Parameters<typeof handle>[0]['event'],
      resolve: async () => new Response()
    } as Parameters<typeof handle>[0]);
    expect(locals.user).toBeNull();
    expect(deleted).toContain(SESSION_COOKIE_NAME);
  });

  it('sets locals.user to null when there is no cookie', async () => {
    const { event, locals } = fakeEvent(undefined);
    await handle({
      event: event as unknown as Parameters<typeof handle>[0]['event'],
      resolve: async () => new Response()
    } as Parameters<typeof handle>[0]);
    expect(locals.user).toBeNull();
  });
});
