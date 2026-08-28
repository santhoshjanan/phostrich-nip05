import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/admin';
import { removeAdminReservation } from '$lib/server/identifiers/adminReservations';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }

  const adminPubkey = locals.user.pubkey;
  if (!isAdmin(adminPubkey)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await removeAdminReservation(adminPubkey, params.name!);
  if (!result.ok) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  return json({ ok: true });
};
