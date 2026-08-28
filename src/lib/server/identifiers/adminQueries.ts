import { and, asc, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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
    .orderBy(asc(identifiers.lastIdentifiedAt), asc(identifiers.name));
}

export async function getReservations(): Promise<Reservation[]> {
  const reservationEvent = alias(identifierEvents, 'reservation_event');
  const newerReservationEvent = alias(identifierEvents, 'newer_reservation_event');

  return db
    .select({
      name: identifiers.name,
      createdAt: identifiers.createdAt,
      reason: reservationEvent.reason,
      actorPubkey: reservationEvent.actorPubkey
    })
    .from(identifiers)
    .leftJoin(
      reservationEvent,
      and(
        eq(reservationEvent.identifierName, identifiers.name),
        eq(reservationEvent.eventType, 'reserved')
      )
    )
    .leftJoin(
      newerReservationEvent,
      and(
        eq(newerReservationEvent.identifierName, identifiers.name),
        eq(newerReservationEvent.eventType, 'reserved'),
        or(
          gt(newerReservationEvent.createdAt, reservationEvent.createdAt),
          and(
            eq(newerReservationEvent.createdAt, reservationEvent.createdAt),
            gt(newerReservationEvent.id, reservationEvent.id)
          )
        )
      )
    )
    .where(and(eq(identifiers.status, 'reserved'), isNull(newerReservationEvent.id)))
    .orderBy(asc(identifiers.name));
}
