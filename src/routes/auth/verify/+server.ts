import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyAuthEvent } from '$lib/server/auth/verify';
import { createSession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { checkRateLimit } from '$lib/server/auth/rateLimit';
import { withAuthErrorHandling } from '$lib/server/auth/errorHandling';
import { config } from '$lib/server/config';

const VERIFY_PUBKEY_LIMIT = 10;
const VERIFY_IP_LIMIT = 20;
const WINDOW_SECONDS = 300;

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) =>
  withAuthErrorHandling(async () => {
    const body = await request.json().catch(() => null);
    const event: unknown =
      body && typeof body === 'object' ? (body as { event?: unknown }).event : undefined;

    if (event === undefined) {
      return json({ error: 'authentication failed' }, { status: 401 });
    }

    // Rate-limit keying needs some string, but validating its shape is
    // verifyAuthEvent's job now (via the Zod schema) — here we just need a
    // safe string to build a Valkey key from.
    const pubkeyForRateLimit =
      typeof event === 'object' &&
      event !== null &&
      typeof (event as { pubkey?: unknown }).pubkey === 'string'
        ? (event as { pubkey: string }).pubkey
        : 'invalid';

    const ip = getClientAddress();
    const ipAllowed = await checkRateLimit(
      `ratelimit:verify:ip:${ip}`,
      VERIFY_IP_LIMIT,
      WINDOW_SECONDS
    );
    const pubkeyAllowed = await checkRateLimit(
      `ratelimit:verify:pubkey:${pubkeyForRateLimit}`,
      VERIFY_PUBKEY_LIMIT,
      WINDOW_SECONDS
    );
    if (!ipAllowed || !pubkeyAllowed) {
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
