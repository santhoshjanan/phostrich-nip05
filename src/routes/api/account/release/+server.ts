import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { invalidateIdentifier } from '$lib/server/db/identifiers';
import { withApiErrorHandling } from '$lib/server/http/errorHandling';

export const POST: RequestHandler = async ({ locals }) =>
  withApiErrorHandling(async () => {
    if (!locals.user) {
      return json({ error: 'unauthenticated' }, { status: 401 });
    }

    const [identifier] = await db
      .select({ name: identifiers.name })
      .from(identifiers)
      .where(and(eq(identifiers.ownerPubkey, locals.user.pubkey), eq(identifiers.status, 'claimed')))
      .limit(1);

    if (!identifier) {
      return json({ error: 'not_found' }, { status: 404 });
    }

    await db.transaction(async (tx) => {
      await tx.delete(identifiers).where(eq(identifiers.name, identifier.name));
      await tx.insert(identifierEvents).values({
        identifierName: identifier.name,
        eventType: 'released',
        actorPubkey: locals.user.pubkey
      });
    });

    await invalidateIdentifier(identifier.name);

    return json({ ok: true });
  });
