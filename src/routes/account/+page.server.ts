import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';

export const load = (async ({ locals }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }

  const [identifier] = await db
    .select({
      name: identifiers.name,
      relays: identifiers.relays,
      lastIdentifiedAt: identifiers.lastIdentifiedAt
    })
    .from(identifiers)
    .where(and(eq(identifiers.ownerPubkey, locals.user.pubkey), eq(identifiers.status, 'claimed')))
    .limit(1);

  if (!identifier) {
    redirect(302, '/claim');
  }

  return {
    name: identifier.name,
    relays: identifier.relays,
    lastIdentifiedAt: identifier.lastIdentifiedAt.toISOString()
  };
}) satisfies PageServerLoad;
