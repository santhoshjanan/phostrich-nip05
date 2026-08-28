import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { config } from '$lib/server/config';

export const load = (async ({ locals }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }

  const [existing] = await db
    .select({ name: identifiers.name, createdAt: identifiers.createdAt })
    .from(identifiers)
    .where(and(eq(identifiers.ownerPubkey, locals.user.pubkey), eq(identifiers.status, 'claimed')))
    .limit(1);

  if (!existing) {
    redirect(302, '/claim');
  }

  const origin = new URL(config.PUBLIC_ORIGIN).host;
  return { identifier: `${existing.name}@${origin}`, issuedAt: existing.createdAt };
}) satisfies PageServerLoad;
