import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { destroySession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { withAuthErrorHandling } from '$lib/server/auth/errorHandling';

export const POST: RequestHandler = async ({ cookies }) =>
  withAuthErrorHandling(async () => {
    const sessionId = cookies.get(SESSION_COOKIE_NAME);
    if (sessionId) {
      await destroySession(sessionId);
    }
    cookies.delete(SESSION_COOKIE_NAME, { path: '/', secure: true });
    return json({ ok: true });
  });
