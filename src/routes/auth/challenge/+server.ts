import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { issueChallenge } from '$lib/server/auth/challenge';
import { checkRateLimit } from '$lib/server/auth/rateLimit';
import { withApiErrorHandling } from '$lib/server/http/errorHandling';

const PUBKEY_PATTERN = /^[0-9a-f]{64}$/;
const CHALLENGE_IP_LIMIT = 20;
const CHALLENGE_PUBKEY_LIMIT = 10;
const WINDOW_SECONDS = 300;

export const POST: RequestHandler = async ({ request, getClientAddress }) =>
  withApiErrorHandling(async () => {
    const body = await request.json().catch(() => null);
    const pubkey = typeof body?.pubkey === 'string' ? body.pubkey : null;

    if (!pubkey || !PUBKEY_PATTERN.test(pubkey)) {
      return json({ error: 'invalid pubkey' }, { status: 400 });
    }

    const ip = getClientAddress();
    const ipAllowed = await checkRateLimit(
      `ratelimit:challenge:ip:${ip}`,
      CHALLENGE_IP_LIMIT,
      WINDOW_SECONDS
    );
    if (!ipAllowed) {
      return json({ error: 'rate limited' }, { status: 429 });
    }

    const pubkeyAllowed = await checkRateLimit(
      `ratelimit:challenge:pubkey:${pubkey}`,
      CHALLENGE_PUBKEY_LIMIT,
      WINDOW_SECONDS
    );
    if (!pubkeyAllowed) {
      return json({ error: 'rate limited' }, { status: 429 });
    }

    const challenge = await issueChallenge(pubkey);
    return json({ challenge });
  });
