import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/admin';
import { forceReleaseAdminIdentifier } from '$lib/server/identifiers/adminForceRelease';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }

  const adminPubkey = locals.user.pubkey;
  if (!isAdmin(adminPubkey)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.name !== 'string' || typeof body?.reason !== 'string') {
    return json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await forceReleaseAdminIdentifier(adminPubkey, body.name, body.reason);
  if (!result.ok) {
    if (result.reason === 'invalid_name' || result.reason === 'reason_required') {
      return json({ error: result.reason }, { status: 400 });
    }
    if (result.reason === 'not_found') {
      return json({ error: 'not_found' }, { status: 404 });
    }
    if (result.reason === 'not_eligible') {
      return json(
        { error: 'no_longer_eligible', lastIdentifiedAt: result.lastIdentifiedAt.toISOString() },
        { status: 409 }
      );
    }
  }

  return json({ ok: true });
};
