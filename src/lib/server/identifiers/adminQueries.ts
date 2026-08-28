import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';

export function staleIdentifierCondition(referenceTime: Date | SQL = sql`now()`) {
  const reference = referenceTime instanceof Date ? referenceTime.toISOString() : referenceTime;
  return sql`${identifiers.lastIdentifiedAt} + interval '6 months' < ${reference}`;
}

export interface StaleIdentifier {
  name: string;
  ownerPubkey: string | null;
  lastIdentifiedAt: Date;
}

export interface Reservation {
  name: string;
  createdAt: Date;
  reason: string | null;
  actorPubkey: string | null;
}

export async function getStaleIdentifiers(
  referenceTime: Date | SQL = sql`now()`
): Promise<StaleIdentifier[]> {
  return db
    .select({
      name: identifiers.name,
      ownerPubkey: identifiers.ownerPubkey,
      lastIdentifiedAt: identifiers.lastIdentifiedAt
    })
    .from(identifiers)
    .where(and(eq(identifiers.status, 'claimed'), staleIdentifierCondition(referenceTime)))
    .orderBy(asc(identifiers.lastIdentifiedAt));
}

export async function getReservations(): Promise<Reservation[]> {
  const rows = await db
    .select({ name: identifiers.name, createdAt: identifiers.createdAt })
    .from(identifiers)
    .where(eq(identifiers.status, 'reserved'))
    .orderBy(asc(identifiers.name));

  // N+1 by design: reservation counts are expected to be small for v1, and this
  // keeps the "latest reserved event per name" lookup simple rather than a window-function query.
  return Promise.all(
    rows.map(async (row) => {
      const [event] = await db
        .select({ reason: identifierEvents.reason, actorPubkey: identifierEvents.actorPubkey })
        .from(identifierEvents)
        .where(
          and(
            eq(identifierEvents.identifierName, row.name),
            eq(identifierEvents.eventType, 'reserved')
          )
        )
        .orderBy(desc(identifierEvents.createdAt))
        .limit(1);
      return { ...row, reason: event?.reason ?? null, actorPubkey: event?.actorPubkey ?? null };
    })
  );
}
