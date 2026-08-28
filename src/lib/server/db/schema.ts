import { sql } from 'drizzle-orm';
import {
  bigserial,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

export const identifierStatus = pgEnum('identifier_status', ['claimed', 'reserved', 'blocked']);

export const identifiers = pgTable(
  'identifiers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: text('name').notNull(),
    status: identifierStatus('status').notNull().default('claimed'),
    ownerPubkey: text('owner_pubkey'),
    relays: jsonb('relays').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastIdentifiedAt: timestamp('last_identified_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    nameUnique: uniqueIndex('identifiers_name_unique').on(table.name),
    ownerPubkeyClaimedUnique: uniqueIndex('identifiers_owner_pubkey_claimed_unique')
      .on(table.ownerPubkey)
      .where(sql`${table.status} = 'claimed'`)
  })
);

export const identifierEventType = pgEnum('identifier_event_type', [
  'claimed',
  'released',
  'force_released',
  'reserved',
  'reservation_removed'
]);

export const identifierEvents = pgTable('identifier_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  identifierName: text('identifier_name').notNull(),
  eventType: identifierEventType('event_type').notNull(),
  actorPubkey: text('actor_pubkey').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
