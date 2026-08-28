import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { invalidateIdentifier } from '$lib/server/db/identifiers';
import { withApiErrorHandling } from '$lib/server/http/errorHandling';
import { validateRelayList } from '$lib/server/identifiers/relays';

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

    const validation = validateRelayList(relays, { allowInsecure: dev });
    if (!validation.ok) {
      return json({ error: validation.error }, { status: 400 });
    }

    const [identifier] = await db
      .select({ name: identifiers.name })
      .from(identifiers)
      .where(and(eq(identifiers.ownerPubkey, locals.user.pubkey), eq(identifiers.status, 'claimed')))
      .limit(1);

    if (!identifier) {
      return json({ error: 'not_found' }, { status: 404 });
    }

    await db
      .update(identifiers)
      .set({ relays: validation.relays, updatedAt: new Date() })
      .where(eq(identifiers.name, identifier.name));

    await invalidateIdentifier(identifier.name);

    return json({ relays: validation.relays });
  });
