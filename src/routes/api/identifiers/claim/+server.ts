import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimIdentifier } from '$lib/server/identifiers/claim';
import { checkRateLimit } from '$lib/server/auth/rateLimit';
import { withApiErrorHandling } from '$lib/server/http/errorHandling';

const PUBKEY_LIMIT = 20;
const WINDOW_SECONDS = 300;

export const POST: RequestHandler = async ({ request, locals }) =>
  withApiErrorHandling(async () => {
    if (!locals.user) {
      return json({ error: 'unauthenticated' }, { status: 401 });
    }

    const allowed = await checkRateLimit(
      `ratelimit:claim:pubkey:${locals.user.pubkey}`,
      PUBKEY_LIMIT,
      WINDOW_SECONDS
    );
    if (!allowed) {
      return json({ error: 'rate limited' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.toLowerCase() : null;

    if (!name) {
      return json({ error: 'invalid_name' }, { status: 400 });
    }

    const result = await claimIdentifier(name, locals.user.pubkey);

    if (!result.ok) {
      if (result.reason === 'invalid_name') {
        return json({ error: 'invalid_name' }, { status: 400 });
      }
      if (result.reason === 'owner_cap') {
        return json({ error: 'owner_cap' }, { status: 409 });
      }
      return json({ error: 'not_available' }, { status: 409 });
    }

    return json({ name }, { status: 201 });
  });
