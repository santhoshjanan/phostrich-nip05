import type { Handle } from '@sveltejs/kit';
import { getSession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(SESSION_COOKIE_NAME);

  if (sessionId) {
    const session = await getSession(sessionId);
    if (session) {
      event.locals.user = session;
    } else {
      event.locals.user = null;
      event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    }
  } else {
    event.locals.user = null;
  }

  return resolve(event);
};
