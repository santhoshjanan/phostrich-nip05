import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/admin';
import { createAdminReservation } from '$lib/server/identifiers/adminReservations';

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

  const result = await createAdminReservation(adminPubkey, body.name, body.reason);
  if (!result.ok) {
    const status =
      result.reason === 'invalid_name' || result.reason === 'reason_required' ? 400 : 409;
    return json({ error: result.reason }, { status });
  }

  return json(
    {
      name: result.name,
      reason: result.reason,
      actorPubkey: result.actorPubkey,
      createdAt: result.createdAt.toISOString()
    },
    { status: 201 }
  );
};
