import { bigserial, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

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
    lastIdentifiedAt: timestamp('last_identified_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    nameUnique: uniqueIndex('identifiers_name_unique').on(table.name)
  })
);
