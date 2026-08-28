# Phostrich

A NIP-05 identifier provider. See `docs/SPEC.md` for the full product/architecture spec.

## Prerequisites

- **Node 24 LTS**
- **pnpm 10** — `corepack enable` exposes the version pinned in `package.json` (`packageManager`); no separate install.
- **Docker** with Compose v2 (`docker compose …`) — runs Postgres 16 and Valkey 8 for local dev and tests.

## Install & run

    corepack enable
    cp .env.example .env
    docker compose up -d            # Postgres :5432, Valkey :6379
    pnpm install
    pnpm db:migrate                 # apply the schema
    pnpm db:seed                    # optional: demo identifiers + reservations
    pnpm dev                        # http://localhost:5173

Verify:

    curl "http://localhost:5173/.well-known/nostr.json?name=alice"

`.env` (copied from `.env.example`) must define `DATABASE_URL`, `VALKEY_URL`,
`PUBLIC_ORIGIN`, `SESSION_TTL_DAYS`, `DEFAULT_RELAYS`, and `ADMIN_PUBKEYS` —
`src/lib/server/config.ts` validates all of them at boot and the process exits on
a missing or malformed value (`ADMIN_PUBKEYS` may be empty). The example values
target the local `docker compose` stack; leave them as-is for development. The
production shape is different — see [Production deployment](#production-deployment).

## Testing

Postgres + Valkey must be up (`docker compose up -d`) with migrations applied.

    pnpm check           # svelte-check + tsc
    pnpm lint            # eslint
    pnpm test            # vitest, watch mode
    pnpm test:coverage   # vitest single run, 90% coverage gate

    pnpm exec playwright install --with-deps chromium   # once
    pnpm build && pnpm test:e2e                         # e2e runs against `pnpm preview` of the build

`pnpm test:coverage` clears the seeded fixture rows (they share names with the dev
seed data) — re-run `pnpm db:seed` afterward if you need them back for manual testing.

## Auth

`/login` drives this from the browser (NIP-07 extension or NIP-46 bunker). The underlying HTTP flow:

    POST /auth/challenge {"pubkey": "<64-hex>"}   -> {"challenge": "<nonce>"}
    # client signs a kind 27235 event: tags u=<origin>/auth/verify, method=POST, challenge=<nonce>
    POST /auth/verify {"event": {...signed event...}}   -> 200 + Set-Cookie, or 401
    POST /auth/logout                                    -> 200, clears the session

`SESSION_TTL_DAYS` (default 30) controls how long a session lasts.

IP-axis rate limiting (`/auth/challenge`, `/auth/verify`) relies on SvelteKit's
`getClientAddress()`. Deployed behind a reverse proxy (as `adapter-node`
typically is), this returns the proxy's own address unless the adapter is
told which header to trust and how many hops to peel off — otherwise every
request collapses into a single shared rate-limit bucket. Check
`@sveltejs/adapter-node`'s current docs for the relevant env vars before
deploying behind a proxy.

## Claim flow

- `/login` — sign in with a NIP-07 extension or a NIP-46 bunker connection.
- `/claim` — pick an available identifier name; a 6-month inactivity policy is shown before the claim is confirmed.
- `/claimed` — the issued identifier, with a copy button.

`PUBLIC_ORIGIN` must exactly match the origin the app is served from — the client's signed auth event and the server's check of it both depend on it. Dev uses `http://localhost:5173`; the e2e run overrides it to `http://localhost:4173` (where `pnpm preview` serves) via `playwright.config.ts`.

## Account management

- `/account` — view your identifier, edit its public relay list (up to 8; `wss://` only outside development), see when it was last verified and when it becomes eligible for release, and release it.
- Releasing an identifier is immediate and irreversible; anyone can claim it afterward.

## Admin dashboard

- `/admin` — visible only to pubkeys listed in `ADMIN_PUBKEYS`. Two sections: a live report of identifiers not looked up through NIP-05 for six calendar months (with force-release, reason required), and reservation management (add/remove, reason required on add).
- Admin actions are always audit-logged to `identifier_events` with the acting admin's pubkey.
- Production deployments must set `ADMIN_PUBKEYS` to their own comma-separated, 64-character lowercase-hex pubkeys. The example environment intentionally grants no administrator access; the checked-in fixed signer is authorized only by the Playwright/CI test environment.

## CI/CD

Every push and PR runs three GitHub Actions jobs: `lint-and-check`, `test` (full suite against real Postgres/Valkey service containers, plus e2e), and `docker-build` (validates the production image builds).

### Production deployment

    cp .env.example .env   # fill in real values: DATABASE_URL, VALKEY_URL,
                           # PUBLIC_ORIGIN, POSTGRES_PASSWORD, ADMIN_PUBKEYS
    docker compose -f docker-compose.prod.yml up -d --build

`DATABASE_URL` and `VALKEY_URL` must point at the compose service names — e.g.
`postgres://phostrich:$POSTGRES_PASSWORD@postgres:5432/phostrich` and
`redis://valkey:6379`. `PUBLIC_ORIGIN` is the external origin only (scheme + host,
no port). Postgres and Valkey are not exposed outside the compose network.

The stack does not include a reverse proxy. The `app` service listens on port
`3000` inside the compose network and expects an external proxy to terminate TLS
and route to it. That proxy must **not** rewrite or redirect
`/.well-known/nostr.json`, and must preserve the app's `Access-Control-Allow-Origin`
header on it. Deployment is manual for v1 — no CI step deploys automatically yet.

## Other commands

    pnpm format:check  # prettier --check
    pnpm build          # production build (@sveltejs/adapter-node)
    pnpm db:generate    # generate a migration after editing src/lib/server/db/schema.ts
