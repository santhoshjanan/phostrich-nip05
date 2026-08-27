# Foundation — Design

Sub-project 1 of the Phostrich build order (see `docs/SPEC.md` for full product/architecture context). This is the first slice: project scaffold, the `identifiers` data model, and the public NIP-05 read endpoint serving from it — with no auth and no claim flow yet. It proves the core product output end-to-end.

## Scope

**In scope:**
- SvelteKit 2 / Svelte 5 project scaffold (TypeScript strict, `@sveltejs/adapter-node`, ESLint, Prettier)
- Zod-validated env config
- Drizzle schema for `identifiers`, migrations
- Valkey client, read-through cache for identifier resolution
- The public `GET /.well-known/nostr.json` endpoint
- A minimal `/healthz`
- A seed script for dev/test fixture data
- `docker-compose.yml` (dev dependencies: Postgres + Valkey)
- Unit + integration test setup (Vitest, real Postgres/Valkey via compose)

**Explicitly out of scope (deferred to later sub-projects):**
- Auth (NIP-07/NIP-46 challenge-response) — sub-project 2
- Claim/release/write paths, `invalidateIdentifier`, the `identifier_events` audit table — sub-project 3
- Reserved-name pattern config, `ADMIN_PUBKEYS` config — sub-project 3 / 5 respectively (nothing reads them yet)
- Any UI/Svelte pages — sub-project 3 is the first screen; Impeccable is invoked there, not here
- Playwright e2e — no browser flow exists yet
- `docker-compose.prod.yml`, CI — sub-project 6

## Config

`src/lib/server/config.ts` — a Zod schema parses `process.env` once at startup and fails fast on missing/malformed values. Foundation's config surface is intentionally small:

- `DATABASE_URL`
- `VALKEY_URL`
- `DEFAULT_RELAYS` — fallback relay list used when an identifier has none set
- `PUBLIC_ORIGIN`

Config stays as env vars, not a YAML file — see rationale below.

**Why env vars, not YAML:** Secrets (`DATABASE_URL`, `VALKEY_URL`, later the platform nsec if DM-OTP is built) must come from the deployment environment regardless — Docker secrets, CI secrets — not a checked-in-shaped file, so that part isn't a YAML-vs-env question at all. What's left is four flat scalars with no real nesting, which doesn't benefit from YAML's structure. `docker-compose.yml` already speaks env vars natively (`environment:`/`env_file:`), so there's no translation layer between how compose injects config and how the app reads it. Where config does have real structure worth reviewing in a diff — the reserved-name pattern list, later — the spec already routes that through a code-reviewed TypeScript file, not a config file of any format, because it's a set of rules a human should read in a PR, not edit blind in a deployed file.

## Data model

One Drizzle table, `identifiers`:

| column | type | notes |
|---|---|---|
| `id` | uuid/serial | PK |
| `name` | text | unique, stored normalized (lowercase) |
| `status` | enum (`claimed`\|`reserved`\|`blocked`) | only `claimed` resolves publicly |
| `owner_pubkey` | text, nullable | 32-byte lowercase hex, no FK yet (no users table until auth lands) |
| `relays` | jsonb (string array) | default `[]`; capped at 8 by the (not-yet-built) write path |
| `created_at` | timestamptz | |
| `last_identified_at` | timestamptz | defaults to `created_at`; write path for lazy updates arrives with the read endpoint |
| `updated_at` | timestamptz | |

`identifier_events` (audit table) and any reservation-management columns are deferred — nothing writes to them until sub-project 3.

## Components

- `src/lib/server/config.ts` — env parsing (above).
- `src/lib/server/valkey.ts` — single shared `ioredis` client.
- `src/lib/server/db/schema.ts` — the `identifiers` table.
- `src/lib/server/db/identifiers.ts` — `resolveIdentifier(name): Promise<{ pubkey: string; relays: string[] } | null>`. Read-only for Foundation; `invalidateIdentifier` is added in sub-project 3 alongside the first write path.
- `src/routes/.well-known/nostr.json/+server.ts` — thin handler: parse, call `resolveIdentifier`, shape JSON, set headers.
- `src/routes/healthz/+server.ts` — checks Postgres and Valkey connectivity, returns 200/503.
- `scripts/seed.ts` (`pnpm db:seed`) — inserts fixture identifiers directly via Drizzle, standing in for the claim flow that doesn't exist yet.

## Data flow

`GET /.well-known/nostr.json?name=X`:

1. Parse `name`; cap its length before any further processing (guards against pathological input reaching a regex or becoming a cache key); normalize to lowercase.
2. If it fails the charset check (`^[a-z0-9-_.]+$`), treat it as a miss rather than a 400 — a validation error here would leak acceptance rules for no benefit and breaks the endpoint's "always 200, never redirect" contract.
3. `resolveIdentifier(name)`:
   - Valkey `GET identifier:<name>` — hit → parse, return.
   - Miss → query Postgres for `status = 'claimed'` (reserved/blocked never resolve publicly). Found → `SET` in Valkey with TTL, return. Not found → `SET` a short-TTL negative marker, return `null`.
4. Route shapes `{"names": ..., "relays": ...}` from the result (empty object if `null`), sets `Access-Control-Allow-Origin: *`, always returns 200.

## Error handling

- **Valkey unreachable** — fail open to Postgres directly (try/catch scoped to the Valkey calls only); the endpoint degrades to slower, not down.
- **Postgres unreachable** — the one real failure mode; a 500 is honest here since there's nothing sensible to serve. `/healthz` surfaces this for operational visibility even though wiring it into compose healthchecks is formally sub-project 6's job — it's cheap enough to add now.

## Testing

- **Unit/integration** (Vitest, against real Postgres + Valkey per the project's no-mocks rule): `resolveIdentifier` — cache hit, cache miss + DB hit, cache miss + DB miss (and that it negative-caches), and that reserved/blocked statuses never resolve. `config.ts` — fail-fast behavior on malformed/missing env.
- **Route-level**: invoke the `+server.ts` `GET` export directly with a constructed `RequestEvent` — response shape, CORS header, case-insensitivity, unknown/invalid name → 200 `{"names":{}}`.
- **No Playwright** in this sub-project — no browser UI exists yet; the first e2e test arrives with sub-project 3's claim flow.
- 90% coverage gate applies from the start.
