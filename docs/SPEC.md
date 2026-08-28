# Phostrich — Product & Architecture Spec

This is the design contract for Phostrich, arrived at through a series of architecture-review conversations. It is the source of truth for product decisions, data model, and system design — not operating instructions for an agent working in this repo (see `CLAUDE.md` for that).

## Status

Greenfield. As of this writing the repo is empty. This document should evolve alongside the implementation: keep it in sync as decisions change, rather than letting the code silently drift from what's written here.

## What this is

Phostrich is a NIP-05 (Nostr identifier) provider. Users prove control of a Nostr pubkey, claim an available identifier, and the platform serves it at `https://<domain>/.well-known/nostr.json?name=<identifier>`.

## Stack

- SvelteKit 2 / Svelte 5 (runes), TypeScript strict, `@sveltejs/adapter-node`
- Postgres — schema + migrations via Drizzle ORM (`drizzle-kit`)
- Valkey (Redis protocol) via `ioredis` — OTP TTLs, sessions, rate limits. Valkey holds only ephemeral state; it is never the source of truth.
- `nostr-tools` for keys, encoding, event signing/verification, and its `nip46` module for the bunker client. DM sealing (`nip17`) is only pulled in if the DM-OTP auth fallback ends up built — see Auth flow. Nothing else in v1 sends a DM.

## Commands

```bash
pnpm dev                      # dev server
pnpm build && pnpm preview    # production build
pnpm check                    # svelte-check + tsc
pnpm lint / pnpm format       # eslint + prettier

pnpm test                     # vitest unit/integration, watch
pnpm test:unit -- run         # single CI-style pass
pnpm vitest run src/lib/server/otp.test.ts            # one file
pnpm vitest run -t "rejects an expired OTP"           # one test by name
pnpm test:coverage            # enforces the 90% threshold
pnpm test:e2e                 # playwright
pnpm test:e2e -- --headed --grep "claim flow"

pnpm db:generate              # drizzle-kit generate after schema edits
pnpm db:migrate
docker compose up -d          # postgres + valkey for local dev
docker compose -f docker-compose.prod.yml up -d --build   # full stack, prod shape
```

Integration and e2e tests run against real Postgres and Valkey from `docker compose`, not mocks — the OTP/session logic is mostly TTL and atomicity behavior, which mocks do not exercise.

## UI/UX

All UI work (claim flow, account page, admin report, the expiry modal, any other screen) goes through the **Impeccable** plugin, not ad hoc component styling. Invoke the `impeccable` skill before designing or redesigning any frontend surface — this is the mechanism for "robust and non-AI slop UX/UI" from the original requirements, not a separate aspiration to hold in your head alongside it. Route new-screen work and later polish/critique passes through it alike.

## Architecture

### Layering

All privileged logic lives in `src/lib/server/**`. Route files (`+page.server.ts`, `+server.ts`) are thin: parse, call a server module, map the result to a response. Nothing under `src/lib/server` may be imported by client code — SvelteKit enforces this, and it is the main guard against leaking the platform's Nostr secret key.

- `src/lib/server/nostr/` — key normalization, event signing, NIP-46 bunker client, DM send (only exists if the DM-OTP fallback is built — nothing else in v1 sends a DM)
- `src/lib/server/auth/` — challenge issue/verify, session create/destroy
- `src/lib/server/db/` — Drizzle schema + queries
- `src/lib/server/valkey.ts` — single shared client
- `src/hooks.server.ts` — resolves the session cookie into `event.locals.user` on every request

### Key normalization (recurring source of bugs)

Store and compare pubkeys as **32-byte lowercase hex**, everywhere: DB columns, Valkey keys, admin allowlist, NIP-05 responses. `npub…` is a display/input format only — decode at the edge in one helper and never let bech32 past it. NIP-05 JSON must contain hex; returning npub silently breaks every client.

### Auth flow

Primary path is signature challenge-response, not DM. A Nostr user proving key ownership by signing a server-issued nonce is instant and has no relay dependency — DM-OTP has both (see below), so it is not the default.

1. `POST /auth/challenge` — user submits a pubkey. Server generates a random nonce, stores `SETEX challenge:<pubkey> 300 <nonce>` in Valkey, and returns it.
2. Client signs the nonce (embedded in a throwaway event, not a raw string — signing arbitrary strings is a phishing vector `window.nostr.signEvent` and NIP-46 both guard against). Two signer paths, both terminating in the same verify step:
   - **NIP-07** — browser extension. `window.nostr.signEvent(...)` client-side; no relay round-trip. This is the fast path and should be tried first whenever `window.nostr` exists.
   - **NIP-46** — remote signer ("bunker"). Client connects via a `bunker://` or `nostrconnect://` URI, the sign request and response travel over a relay the bunker listens on. Slower and it depends on that one relay being reachable, but it covers mobile/cross-device signers that NIP-07 can't.
3. `POST /auth/verify` — server checks the signed event's pubkey matches the claimed pubkey, the embedded nonce matches `challenge:<pubkey>`, the signature verifies, and the event timestamp is within a small window (reject replays). Delete the challenge key on success (single-use).
4. On success, mint an opaque 32-byte session id, store the session in Valkey with a sliding TTL, and set it as an `httpOnly; Secure; SameSite=Lax` cookie. Session data never lives in the cookie itself.

**DM-based OTP is demoted to a last-resort fallback, not a v1 requirement.** Relay-delivered DMs (even NIP-17 gift-wrapped) have no delivery guarantee and no read receipt — a user can be stuck with an OTP that silently never arrives, which is a worse failure mode than "no NIP-07 extension installed." Build NIP-07 + NIP-46 first; only add DM-OTP if there's a real coverage gap after that (e.g., a signer-less mobile browser), and if it's built, put it behind its own feature flag with tighter rate limits than the challenge path, since it's also the platform's only way to spam-DM an arbitrary pubkey it doesn't control.

Every auth endpoint is rate-limited (see Rate limiting below). Responses must not reveal whether a pubkey is known to the system.

If the DM-OTP fallback is built, delivery uses NIP-17 (gift-wrapped, `kind:1059`), never NIP-04. The platform signs with a dedicated identity key from config; that key is server-only and must never reach `$lib` shared code. Note that inactivity expiry (below) does not warn by DM — if DM-OTP is never built, v1 sends no DMs at all.

### Rate limiting

Valkey `INCR` + `EXPIRE` fixed-window counters, keyed per endpoint and per identity axis. Fixed-window is simpler than sliding-window and good enough here — these are abuse backstops, not billing meters. Two axes per sensitive endpoint, because either alone is bypassable (many pubkeys from one IP, or one pubkey rotated through many IPs via Tor/VPN):

- `ratelimit:challenge:ip:<ip>` and `ratelimit:challenge:pubkey:<pubkey>` — bounds challenge issuance.
- `ratelimit:verify:pubkey:<pubkey>` — bounds signature-verify attempts per outstanding challenge (on top of the challenge's own 5-minute TTL and single-use deletion).
- If DM-OTP is built: its own counters, tighter than the challenge path, since a hit there sends a DM to a real person, not just a failed local check.
- `ratelimit:claim:pubkey:<pubkey>` and a global `ratelimit:claim:ip:<ip>` — bounds identifier-claim attempts, which is also where reserved-word/pattern probing would show up.

Starting numbers are placeholders to tune against real traffic, not commitments: a handful of challenge issuances per minute per IP, a slightly looser per-pubkey bound (a legitimate user retrying a failed extension popup shouldn't get locked out), and a few claim attempts per minute. Exceeding a bound returns 429 with the same response shape as other auth failures — don't leak which bound tripped.

### Roles

Two personas, no role column. Admin is membership in a config-provided allowlist of pubkeys, normalized to hex at load. The check is a single server helper used by both the admin routes and the layout guard. Admin dashboard is a page inside the same app, not a separate deployment. It is read-only apart from two write surfaces — managing exact-name reservations, and force-releasing inactive identifiers (both below). It shows non-private fields only: never OTPs, session ids, or raw contact data. Every admin write is audit-logged with the acting pubkey.

### NIP-05 endpoint

`src/routes/.well-known/nostr.json/+server.ts` is the one public, unauthenticated, high-traffic route. It must:

- return `{"names": {"<name>": "<hex>"}, "relays": {"<hex>": [...]}}`
- send `Access-Control-Allow-Origin: *` (clients fetch cross-origin; without this, verification fails silently)
- never redirect — clients do not follow redirects here
- treat names case-insensitively and restrict them to `^[a-z0-9-_.]+$`
- serve unknown names as `{"names":{}}` with 200, not 404
- serve from a Valkey read-through cache: build the JSON on the first request for a name, cache it under the normalized name, and give it a TTL. Also `DEL` it on every write (claim, release, relay edit) via one `invalidateIdentifier(name)` helper — the TTL alone is not enough, because a user checks their verification in a client seconds after claiming, and that is precisely when a stale entry is most visible. The TTL stays as the backstop for a write path that forgets to invalidate.
- negative-cache misses too (short TTL): the route is public and unauthenticated, so name enumeration is the traffic that would otherwise reach Postgres on every request. At v1 scale the cache buys DoS headroom, not latency — a unique-index lookup is sub-millisecond.

See below for availability and reservations.

### Identifier lifecycle and reservations

One table. Names live in a single `identifiers` table with a status enum — `claimed | reserved | blocked` — under one unique index on the normalized name. Do not put reservations in a separate table: two tables that can each own a name means a race between reserving and claiming, and the unique index can no longer arbitrate. With one table, granting a reserved name to a real user is a status flip plus an owner write, not a delete-then-insert.

Availability is decided by the constraint, not by a read-then-write. Attempt the insert and handle the unique violation; a `SELECT` followed by an `INSERT` is a race under concurrent claims.

Two kinds of reservation, deliberately stored differently:

- **Exact names → database, admin-editable.** Rows with `status = 'reserved'`, plus a reason and the admin pubkey that set it. Reservations have a lifecycle (held for a trademark, later granted or released) and need an audit trail, so they must be changeable without a redeploy. The admin settings page is the surface for this.
- **Patterns → config, code-reviewed.** `admin`, `support`, `help`, `phostrich`, anything matching `^_`, slur substrings. These are rules rather than data, they change rarely, and they should go through review rather than a dashboard form. Checked at claim time, before the insert.

`_` is the root identifier: `nostr.json?name=_` identifies the *domain itself*, so `phostrich.com` resolves as an identity. Point it at the platform's own pubkey and block it from the claim path entirely — never let it reach the user-claimable pool.

Reserved and blocked names are invisible to the public endpoint. `nostr.json` returns `{"names":{}}` for them, identically to a name that does not exist — reservation status is not something the endpoint should disclose.

Also enforce at claim time: a length range, no leading or trailing `.`/`-`/`_`, and no consecutive dots. Confusable-character squatting (`1`/`l`, `0`/`o`) is not worth blocking automatically at v1, but flagging near-collisions with existing names in the admin report is cheap.

**Release.** A user can release their own identifier from the account page. Release is a hard delete of the row, not a status flip back to available — a soft-deleted "claimed" row would still occupy the unique index slot unless it were carved out with a partial index, which is unnecessary complexity. The owner-scoped `DELETE ... RETURNING` and its separate append-only `identifier_events` audit row (`claimed | released | force_released`, actor pubkey, timestamp) occur in the same transaction, since the row that would normally carry that history is gone.

**Inactivity tracking.** `identifiers.last_identified_at` records the last time the name was actually looked up via `nostr.json`, defaulting to the claim timestamp so a brand-new name isn't immediately stale. Updating it on every request would turn the one hot, unauthenticated public route into a write path, which defeats the caching design above — so update it lazily: on a request for a name, write `last_identified_at` only if the stored value is more than a day old (`UPDATE ... WHERE name = $1 AND last_identified_at < now() - interval '1 day'`), which is a no-op for the overwhelming majority of requests and still gives day-granularity, more than enough for a 6-month window.

**Expiry policy is a live report, not an automatic delete, and warns at claim time rather than by DM.** No ongoing-notification channel is required, which is deliberate — it sidesteps relying on relay-delivered DMs for something as consequential as losing an identity:
- At claim time, a modal states the inactivity policy in plain terms (identifier freed after N months with no lookup) before the claim is confirmed — this is the only place the policy is communicated, so its wording is worth getting right and worth a coverage test that it appears.
- The account page shows the current status next to each owned identifier — `Last NIP-05 lookup` and a calm `Eligible for release after` line — so a returning user can see it without having remembered the modal.
- The Admin report is a live database query, sorted by staleness. There is no scheduled scan job: with no warning channel, materialized report, or automatic deletion, a background scan would only duplicate eligibility logic. Both the report and the force-release mutation use the same PostgreSQL condition, `last_identified_at < now() - interval '6 months'`.
- Admin reviews the flagged list and force-releases individual names by hand, with a required reason. Its conditional delete and `force_released` audit insertion occur in the same transaction; cache invalidation remains fail-open after commit. It is deliberately manual: an unattended auto-release on a Nostr identity has a high blast radius for a false positive.

This closes out the DM/warning tension: v1 needs no DM-send capability for expiry at all. The DM-OTP auth fallback above is a separate, still-open question — if it's never built, v1 sends no DMs whatsoever.

### Relays

The `relays` map in `nostr.json` is per-pubkey and is what lets clients find the user after verifying them, so it is a product surface, not a detail.

- Authenticated users manage their own relay list from their account page. Persist it as an ordered list on the identifier's owner row.
- Config supplies a platform default list. It is the fallback for users who have set none — **not** a set merged into every response. Merging would publish the platform's relays under every user's pubkey and make the field useless for actual routing.
- Validate on write: `wss://` (allow `ws://` only in dev), parseable URL, no credentials or query string, deduplicate after normalizing the trailing slash, and cap the list (8 is a reasonable ceiling — the NIP-05 response is fetched on every profile view).
- Editing relays invalidates the same Valkey cache entry as a name claim. Both paths must go through one `invalidateIdentifier(name)` helper.
- Relay lists are public by definition. They appear in the admin report and carry no privacy expectation.

Publishing the user's relay list as a NIP-65 (`kind:10002`) event is out of scope for v1 — the platform holds no user signing key and cannot sign on their behalf.

## Testing

90% line coverage is a build gate, not a goal. Follow TDD: the OTP, session, allowlist, and name-normalization modules are pure enough to test directly, and that is where the coverage should come from. Do not chase the number with tests over `+page.svelte` markup.

## CI/CD and deployment

v1: GitHub Actions on every push — lint, check, unit + integration (with Postgres/Valkey services), e2e, coverage gate. v2 extends the same workflow to deploy on green `main`.

Deployment is `docker-compose` on a single host. Keep two compose files with distinct roles and do not let them drift into one:

- `docker-compose.yml` — dev dependencies only (Postgres, Valkey, exposed ports). The app runs on the host via `pnpm dev`.
- `docker-compose.prod.yml` — app image + Postgres + Valkey + a TLS-terminating reverse proxy. Postgres and Valkey are on an internal network with **no published ports**; Valkey holds live session tokens and must never be reachable from outside the compose network.

Notes that bite in this setup:

- The app is a multi-stage build on `adapter-node`. Secrets (platform nsec, DB password, Valkey password, session secret) come from the environment at runtime, never from build args — build args land in image layers. With expiry warnings and NIP-05 serving both DM-free, the platform nsec is only needed at all if the DM-OTP auth fallback gets built; if it doesn't, drop the nsec and the `nostr/` DM module from v1 entirely rather than keeping unused key material around. If it is built, a leaked nsec lets an attacker send authenticated-looking DMs as the platform to any Nostr user, so it still warrants a secrets file or `docker secret` rather than a plain env var in `docker-compose.prod.yml`, if the deployment target supports it.
- Migrations run as a one-shot service that must exit 0 before the app starts, and must be backward-compatible with the previous release so a rollback does not require a down-migration.
- Postgres needs a named volume and a documented `pg_dump` path. Valkey is disposable by design — losing it logs everyone out and drops in-flight OTPs, which is acceptable; never put anything there that cannot be rebuilt from Postgres.
- The reverse proxy must not rewrite or redirect `/.well-known/nostr.json`, and must preserve the CORS header the app sets.
- Add a `/healthz` that checks Postgres and Valkey, and wire it to compose healthchecks so the proxy does not route to a booting app.

## v2 direction

SaaS with Lightning payments via Alby (NWC). Anticipate it in the schema — identifiers get an owner, a plan, and an expiry — but do not build billing into v1.

## Assumptions to confirm

Drizzle over Prisma; ioredis over node-redis; Vitest + Playwright; NIP-17 over NIP-04 if DM-OTP ends up built. Auth is NIP-07 + NIP-46 challenge-response as the confirmed v1 path; DM-OTP remains an optional, undecided fallback — confirm before building it, since it's the only thing in v1 that would need the platform nsec at all. Inactivity expiry is confirmed: claim-time modal + account-page status + admin report/force-release, no warning DM, 6-month threshold locked. Change any of these here first if you decide otherwise.
