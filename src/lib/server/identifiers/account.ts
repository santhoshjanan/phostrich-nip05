import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { invalidateIdentifier } from '../db/identifiers';
import { validateRelayList } from './relays';

export type SaveOwnedRelaysResult =
  | { ok: true; name: string; relays: string[] }
  | { ok: false; reason: 'invalid_relays'; error: string }
  | { ok: false; reason: 'not_found' };

export async function saveOwnedRelays(
  ownerPubkey: string,
  relays: string[],
  options: { allowInsecure: boolean }
): Promise<SaveOwnedRelaysResult> {
  const validation = validateRelayList(relays, options);
  if (!validation.ok) return { ok: false, reason: 'invalid_relays', error: validation.error };

  const [updated] = await db
    .update(identifiers)
    .set({ relays: validation.relays, updatedAt: new Date() })
    .where(and(eq(identifiers.ownerPubkey, ownerPubkey), eq(identifiers.status, 'claimed')))
    .returning({ name: identifiers.name });

  if (!updated) return { ok: false, reason: 'not_found' };
  await invalidateIdentifier(updated.name);
  return { ok: true, name: updated.name, relays: validation.relays };
}

export type ReleaseOwnedIdentifierResult =
  { ok: true; name: string } | { ok: false; reason: 'not_found' };

export async function releaseOwnedIdentifier(
  ownerPubkey: string
): Promise<ReleaseOwnedIdentifierResult> {
  const releasedName = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(identifiers)
      .where(and(eq(identifiers.ownerPubkey, ownerPubkey), eq(identifiers.status, 'claimed')))
      .returning({ name: identifiers.name });

    if (!deleted) return null;
    await tx.insert(identifierEvents).values({
      identifierName: deleted.name,
      eventType: 'released',
      actorPubkey: ownerPubkey,
      reason: null
    });
    return deleted.name;
  });

  if (releasedName === null) return { ok: false, reason: 'not_found' };
  await invalidateIdentifier(releasedName);
  return { ok: true, name: releasedName };
}
