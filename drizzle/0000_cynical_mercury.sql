CREATE TYPE "public"."identifier_status" AS ENUM('claimed', 'reserved', 'blocked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identifiers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "identifier_status" DEFAULT 'claimed' NOT NULL,
	"owner_pubkey" text,
	"relays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_identified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "identifiers_name_unique" ON "identifiers" USING btree ("name");