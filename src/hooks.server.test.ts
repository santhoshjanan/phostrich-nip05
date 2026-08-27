// src/hooks.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';
import * as sessionModule from '$lib/server/auth/session';
import { createSession, destroySession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';

const TEST_PUBKEY = '4'.repeat(64);

function fakeEvent(cookieValue: string | undefined) {
  const store = new Map<string, string>();
  if (cookieValue !== undefined) store.set(SESSION_COOKIE_NAME, cookieValue);

  const locals: { user: { pubkey: string } | null } = { user: null };
  const deleted: string[] = [];
  const sets: { name: string; value: string; opts: unknown }[] = [];

  const event = {
    cookies: {
      get: (name: string) => store.get(name),
      delete: (name: string) => {
        deleted.push(name);
        store.delete(name);
      },
      set: (name: string, value: string, opts: unknown) => {
        sets.push({ name, value, opts });
        store.set(name, value);
      }
    },
    locals
  };

  return { event, deleted, sets, locals };
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

  it('re-issues the session cookie with a fresh maxAge on a valid lookup (sliding expiry)', async () => {
    const sessionId = await createSession(TEST_PUBKEY);
    try {
      const { event, sets } = fakeEvent(sessionId);
      await handle({
        event: event as unknown as Parameters<typeof handle>[0]['event'],
        resolve: async () => new Response()
      } as Parameters<typeof handle>[0]);
      const cookieSet = sets.find((s) => s.name === SESSION_COOKIE_NAME);
      expect(cookieSet).toBeDefined();
      expect(cookieSet?.value).toBe(sessionId);
      expect(cookieSet?.opts).toMatchObject({ maxAge: expect.any(Number) });
    } finally {
      await destroySession(sessionId);
    }
  });

  it('sets locals.user to null and clears the cookie for an invalid session id', async () => {
    const validShapeButUnknown = 'a'.repeat(64);
    const { event, locals, deleted } = fakeEvent(validShapeButUnknown);
    await handle({
      event: event as unknown as Parameters<typeof handle>[0]['event'],
      resolve: async () => new Response()
    } as Parameters<typeof handle>[0]);
    expect(locals.user).toBeNull();
    expect(deleted).toContain(SESSION_COOKIE_NAME);
  });

  it('sets locals.user to null and clears the cookie for a malformed (non-hex) session id, without hitting the store', async () => {
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

  it('treats a thrown getSession as "not logged in" without clearing the cookie (Valkey outage)', async () => {
    const sessionId = await createSession(TEST_PUBKEY);
    const spy = vi
      .spyOn(sessionModule, 'getSession')
      .mockRejectedValueOnce(new Error('connection refused'));
    try {
      const { event, locals, deleted } = fakeEvent(sessionId);
      await handle({
        event: event as unknown as Parameters<typeof handle>[0]['event'],
        resolve: async () => new Response()
      } as Parameters<typeof handle>[0]);
      expect(locals.user).toBeNull();
      expect(deleted).not.toContain(SESSION_COOKIE_NAME);
    } finally {
      spy.mockRestore();
      await destroySession(sessionId);
    }
  });
});
