import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Event } from 'nostr-tools';
import { verifyAuthEvent } from '$lib/server/auth/verify';
import { createSession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { checkRateLimit } from '$lib/server/auth/rateLimit';
import { withAuthErrorHandling } from '$lib/server/auth/errorHandling';
import { config } from '$lib/server/config';

const VERIFY_PUBKEY_LIMIT = 10;
const WINDOW_SECONDS = 300;

export const POST: RequestHandler = async ({ request, cookies }) =>
  withAuthErrorHandling(async () => {
    const body = await request.json().catch(() => null);
    const event = body?.event as Event | undefined;

    if (!event || typeof event.pubkey !== 'string' || !Array.isArray(event.tags)) {
      return json({ error: 'authentication failed' }, { status: 401 });
    }

    const allowed = await checkRateLimit(
      `ratelimit:verify:pubkey:${event.pubkey}`,
      VERIFY_PUBKEY_LIMIT,
      WINDOW_SECONDS
    );
    if (!allowed) {
      return json({ error: 'rate limited' }, { status: 429 });
    }

    const result = await verifyAuthEvent(event);
    if (!result) {
      return json({ error: 'authentication failed' }, { status: 401 });
    }

    const sessionId = await createSession(result.pubkey);
    cookies.set(SESSION_COOKIE_NAME, sessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60
    });

    return json({ pubkey: result.pubkey });
  });
