import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withApiErrorHandling } from '$lib/server/http/errorHandling';
import { releaseOwnedIdentifier } from '$lib/server/identifiers/account';

export const POST: RequestHandler = async ({ locals }) =>
  withApiErrorHandling(async () => {
    if (!locals.user) {
      return json({ error: 'unauthenticated' }, { status: 401 });
    }
    const result = await releaseOwnedIdentifier(locals.user.pubkey);
    if (!result.ok) {
      return json({ error: 'not_found' }, { status: 404 });
    }

    return json({ ok: true });
  });
