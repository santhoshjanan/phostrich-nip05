import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { isValidNameFormat } from './reservedPatterns';

export type CreateAdminReservationResult =
  | { ok: true; name: string; reason: string; actorPubkey: string; createdAt: Date }
  | {
      ok: false;
      reason: 'invalid_name' | 'reason_required' | 'name_claimed' | 'name_already_reserved';
    };

export async function createAdminReservation(
  actorPubkey: string,
  rawName: string,
  rawReason: string
): Promise<CreateAdminReservationResult> {
  const name = rawName.toLowerCase();
  const reason = rawReason.trim();

  if (!isValidNameFormat(name)) return { ok: false, reason: 'invalid_name' };
  if (!reason) return { ok: false, reason: 'reason_required' };

  try {
    const createdAt = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(identifiers)
        .values({ name, status: 'reserved', ownerPubkey: null })
        .returning({ createdAt: identifiers.createdAt });

      await tx.insert(identifierEvents).values({
        identifierName: name,
        eventType: 'reserved',
        actorPubkey,
        reason
      });

      return created.createdAt;
    });

    return { ok: true, name, reason, actorPubkey, createdAt };
  } catch (error) {
    const pgError = error as { code?: string; constraint_name?: string };
    if (pgError.code !== '23505' || pgError.constraint_name !== 'identifiers_name_unique') {
      throw error;
    }

    const [existing] = await db
      .select({ status: identifiers.status })
      .from(identifiers)
      .where(eq(identifiers.name, name))
      .limit(1);

    return {
      ok: false,
      reason: existing?.status === 'claimed' ? 'name_claimed' : 'name_already_reserved'
    };
  }
}
