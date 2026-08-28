import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { invalidateIdentifier } from '../db/identifiers';
import { staleIdentifierCondition } from './adminQueries';

export type ForceReleaseAdminIdentifierResult =
  | { ok: true; name: string; reason: string }
  | { ok: false; reason: 'invalid_name' | 'reason_required' | 'not_found' }
  | { ok: false; reason: 'not_eligible'; lastIdentifiedAt: Date };

export async function forceReleaseAdminIdentifier(
  actorPubkey: string,
  rawName: string,
  rawReason: string
): Promise<ForceReleaseAdminIdentifierResult> {
  const name = rawName.toLowerCase();
  const reason = rawReason.trim();
  if (!name) return { ok: false, reason: 'invalid_name' };
  if (!reason) return { ok: false, reason: 'reason_required' };

  const deletedName = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(identifiers)
      .where(
        and(
          eq(identifiers.name, name),
          eq(identifiers.status, 'claimed'),
          staleIdentifierCondition()
        )
      )
      .returning({ name: identifiers.name });
    if (!deleted) return null;

    await tx.insert(identifierEvents).values({
      identifierName: deleted.name,
      eventType: 'force_released',
      actorPubkey,
      reason
    });
    return deleted.name;
  });

  if (deletedName === null) {
    const [current] = await db
      .select({ lastIdentifiedAt: identifiers.lastIdentifiedAt })
      .from(identifiers)
      .where(eq(identifiers.name, name))
      .limit(1);
    return current
      ? { ok: false, reason: 'not_eligible', lastIdentifiedAt: current.lastIdentifiedAt }
      : { ok: false, reason: 'not_found' };
  }

  await invalidateIdentifier(deletedName);
  return { ok: true, name: deletedName, reason };
}
