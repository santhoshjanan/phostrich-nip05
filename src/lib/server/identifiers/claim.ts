import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { invalidateIdentifier } from '../db/identifiers';
import { isClaimableName } from './reservedPatterns';

export type ClaimResult = { ok: true } | { ok: false; reason: 'invalid_name' | 'name_taken' | 'owner_cap' };

export async function claimIdentifier(name: string, ownerPubkey: string): Promise<ClaimResult> {
  if (!isClaimableName(name)) {
    return { ok: false, reason: 'invalid_name' };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(identifiers).values({ name, status: 'claimed', ownerPubkey });
      await tx.insert(identifierEvents).values({
        identifierName: name,
        eventType: 'claimed',
        actorPubkey: ownerPubkey
      });
    });
  } catch (error) {
    const pgError = error as { code?: string; constraint_name?: string };
    if (pgError.code === '23505' && pgError.constraint_name === 'identifiers_owner_pubkey_claimed_unique') {
      return { ok: false, reason: 'owner_cap' };
    }
    if (pgError.code === '23505' && pgError.constraint_name === 'identifiers_name_unique') {
      return { ok: false, reason: 'name_taken' };
    }
    throw error;
  }

  await invalidateIdentifier(name);
  return { ok: true };
}
