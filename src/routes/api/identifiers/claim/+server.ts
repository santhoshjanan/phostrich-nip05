import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimIdentifier } from '$lib/server/identifiers/claim';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
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
};
