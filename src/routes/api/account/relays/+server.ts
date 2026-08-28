import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withApiErrorHandling } from '$lib/server/http/errorHandling';
import { saveOwnedRelays } from '$lib/server/identifiers/account';

export const PUT: RequestHandler = async ({ request, locals }) =>
  withApiErrorHandling(async () => {
    if (!locals.user) {
      return json({ error: 'unauthenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const relays = Array.isArray(body?.relays) ? body.relays : null;
    if (!relays || !relays.every((relay: unknown) => typeof relay === 'string')) {
      return json({ error: 'invalid_relays' }, { status: 400 });
    }

    const result = await saveOwnedRelays(locals.user.pubkey, relays, { allowInsecure: dev });
    if (!result.ok && result.reason === 'invalid_relays') {
      return json({ error: result.error }, { status: 400 });
    }
    if (!result.ok) {
      return json({ error: 'not_found' }, { status: 404 });
    }

    return json({ relays: result.relays });
  });
