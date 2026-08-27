CREATE TYPE "public"."identifier_event_type" AS ENUM('claimed', 'released', 'force_released');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identifier_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"identifier_name" text NOT NULL,
	"event_type" "identifier_event_type" NOT NULL,
	"actor_pubkey" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "identifiers_owner_pubkey_claimed_unique" ON "identifiers" USING btree ("owner_pubkey") WHERE "identifiers"."status" = 'claimed';