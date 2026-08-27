import type { Handle } from '@sveltejs/kit';
import { getSession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { config } from '$lib/server/config';

const SESSION_ID_PATTERN = /^[0-9a-f]{64}$/;

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(SESSION_COOKIE_NAME);

  if (sessionId && SESSION_ID_PATTERN.test(sessionId)) {
    let session: { pubkey: string } | null = null;
    let lookupFailed = false;
    try {
      session = await getSession(sessionId);
    } catch {
      // Valkey unreachable or otherwise erroring: treat as "not logged in"
      // for this request, but do NOT clear the cookie — that would log
      // everyone out during a transient outage. Only a genuine
      // invalid-session-id response (session === null with no throw)
      // clears it, below.
      lookupFailed = true;
    }

    if (session) {
      event.locals.user = session;
      event.cookies.set(SESSION_COOKIE_NAME, sessionId, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60
      });
    } else if (lookupFailed) {
      event.locals.user = null;
    } else {
      event.locals.user = null;
      event.cookies.delete(SESSION_COOKIE_NAME, { path: '/', secure: true });
    }
  } else if (sessionId) {
    // Malformed session id (wrong shape) — skip the Valkey round trip
    // entirely and go straight to the invalid-session branch.
    event.locals.user = null;
    event.cookies.delete(SESSION_COOKIE_NAME, { path: '/', secure: true });
  } else {
    event.locals.user = null;
  }

  return resolve(event);
};
