# AGENTS.md

Operational guide for coding agents. Product & architecture context lives in `docs/SPEC.md`; working conventions in `CLAUDE.md`. This file is the setup / run / gotchas cheat sheet.

## What this is

Phostrich — a NIP-05 identifier provider. SvelteKit 2 (Svelte 5, runes) + TypeScript, `@sveltejs/adapter-node`. Drizzle ORM on **Postgres 16** (source of truth). **Valkey 8** for ephemeral state only (sessions, auth challenges, rate-limit counters — all TTL'd).

## Setup

```
corepack enable                 # provides pnpm 10 (pinned in package.json → packageManager)
cp .env.example .env
docker compose up -d            # Postgres :5432, Valkey :6379
pnpm install
pnpm db:migrate
pnpm db:seed                    # optional demo data
pnpm dev                        # http://localhost:5173
```

Requires Node 24 LTS and Docker with Compose v2.

## Commands

| Task                                                        | Command                       |
| ----------------------------------------------------------- | ----------------------------- |
| dev server (:5173)                                          | `pnpm dev`                    |
| type check                                                  | `pnpm check`                  |
| lint                                                        | `pnpm lint`                   |
| format check                                                | `pnpm format:check`           |
| unit + integration, 90% coverage gate                       | `pnpm test:coverage`          |
| e2e (Playwright)                                            | `pnpm build && pnpm test:e2e` |
| production build                                            | `pnpm build`                  |
| apply migrations                                            | `pnpm db:migrate`             |
| new migration (after editing `src/lib/server/db/schema.ts`) | `pnpm db:generate`            |

Full local gate before a PR: `pnpm check && pnpm lint && pnpm test:coverage && pnpm build && pnpm test:e2e`.

## Environment

`src/lib/server/config.ts` validates the **entire** env at module load — a missing or malformed variable crashes the process (and fails `pnpm build`, which evaluates server modules). Required in `.env`:

`DATABASE_URL`, `VALKEY_URL`, `PUBLIC_ORIGIN` (scheme + host, no trailing slash), `SESSION_TTL_DAYS`, `DEFAULT_RELAYS`, `ADMIN_PUBKEYS` (comma-separated 64-char lowercase hex; may be empty).

- **Dev `.env`** (from `.env.example`): `localhost` hosts, `PUBLIC_ORIGIN=http://localhost:5173`.
- **Prod** (`docker-compose.prod.yml`): compose service-name hosts (`@postgres:5432`, `redis://valkey:6379`), `PUBLIC_ORIGIN` is the real external origin. A prod-shaped `.env` will **not** work with `pnpm dev` / `pnpm test` from the host.

## Gotchas

- **e2e runs against the built app**, not the dev server — run `pnpm build` first. One-time: `pnpm exec playwright install --with-deps chromium`. `playwright.config.ts` injects a checked-in test-admin pubkey into the preview server only; no example/prod env grants admin.
- **`pnpm test:coverage` deletes the seeded fixture rows** (they share names with `db:seed`). Re-run `pnpm db:seed` for manual testing afterward.
- **Docker on WSL**: prefer `/usr/bin/docker`; the Windows Docker Desktop shim that may sit first on `PATH` doesn't work in a non-login shell.
- **`ADMIN_PUBKEYS`** gates `/admin` and `/api/admin/*`. Editing `.env` for a running prod container requires `docker compose -f docker-compose.prod.yml up -d` to re-create it.
- **Layering** (enforced by review, not tooling): nothing under `src/lib/server/**` may be imported by client code; route files stay thin.
- **Pubkeys**: 32-byte lowercase hex everywhere (DB, cache keys, config, responses). Decode `npub…` only at the edge, in one helper.

## Layout

```
src/routes/(app)/            /account /claim /admin — behind the auth masthead
src/routes/(bare)/           /login /claimed — chrome-free
src/routes/+layout.svelte    root: global fixed status-bar footer + the flex height chain
src/routes/api/**            JSON endpoints (claim, account, admin)
src/routes/auth/**            challenge / verify / logout
src/lib/server/**            privileged: db, auth, config, identifiers — never imported client-side
src/lib/client/**            browser helpers (signing, form logic)
scripts/migrate.ts, seed.ts  run via tsx (pnpm db:migrate / db:seed)
docs/SPEC.md                  product + architecture spec — read before non-trivial work
```

## CI & deploy

`.github/workflows/ci.yml` runs on a self-hosted Gitea runner: `lint-and-check`, `test` (service containers + e2e), `docker-build`. `docker-compose.prod.yml` is a deployable artifact (app + migrate one-shot + Postgres + Valkey); it ships no reverse proxy — an external one terminates TLS and must pass `/.well-known/nostr.json` through untouched (no redirect, keep the CORS header). Deployment is manual.
