# CI/CD — Design

Sub-project 6 (final) of the Phostrich build order (see `docs/SPEC.md` for full product/architecture context, and all five prior design docs this depends on). Adds the GitHub Actions CI pipeline and the production deployment artifacts (`Dockerfile`, `docker-compose.prod.yml`). Not UI-bearing — no Impeccable involvement.

## Scope decision: the inactivity-scan job is dropped

The daily scheduled job described in earlier drafts of `docs/SPEC.md` had two original purposes, both now gone: the staleness report is a live query (Admin dashboard, sub-project 5), and the warning-DM purpose was cut earlier in the project. Every other piece of ephemeral state (sessions, challenges, rate-limit counters) already expires itself via Valkey TTLs. There is nothing left for a scheduled job to do, so none is built. If a real need for scheduled automation surfaces later, it becomes its own sub-project backed by an actual requirement.

## Scope

**In scope:**
- `.github/workflows/ci.yml` — lint, check, unit+integration tests (with Postgres/Valkey service containers), e2e, coverage gate
- `Dockerfile` — multi-stage, `@sveltejs/adapter-node`, Node 24 LTS
- `docker-compose.prod.yml`
- `playwright.config.ts` — CI-only retry

**Explicitly out of scope:**
- Automated deployment (a workflow step that deploys on green `main`) — `docs/SPEC.md` states this is v2, not a decision made here. `docker-compose.prod.yml` is a deployable artifact; running it stays a manual operation.
- The inactivity-scan job (see above).

## CI pipeline

Three independent jobs in `.github/workflows/ci.yml`, triggered on `push` and `pull_request`, no `needs:` between them (parallel):

1. **`lint-and-check`** — checkout, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm check`. No services; fastest job, fails fast.
2. **`test`** — checkout, install, native GitHub Actions `services:` for `postgres:16-alpine` and `valkey/valkey:8-alpine` (matching Foundation's dev `docker-compose.yml` exactly, so CI and local dev never drift). Env: `DATABASE_URL`/`VALKEY_URL` pointed at the service containers and a dummy `PUBLIC_ORIGIN`. Vitest injects its own test-only admin identity; `playwright.config.ts` injects the checked-in signer's derived pubkey only into the Playwright worker and preview server. No example or production allowlist grants that identity. Steps: `pnpm db:migrate` → `pnpm test:coverage` → `pnpm build` → `pnpm exec playwright install --with-deps chromium` → `pnpm test:e2e`.
3. **`docker-build`** — `docker build .` against the new `Dockerfile`. Validates the deployable image actually builds; does not run it (running with real secrets is a deploy-time concern, out of scope here).

Node 24 LTS everywhere (CI runners and the `Dockerfile`).

## Error handling

- Coverage/test failures already fail the process via `vitest`'s own threshold config (Foundation) — CI jobs just fail on that exit code; nothing to reimplement.
- Playwright gets `retries: 1` in CI only (`process.env.CI` check in `playwright.config.ts`) — mitigates CI-environment timing flakiness that local runs don't need.
- The `Dockerfile` never accepts secrets via `ARG`/build args, per `docs/SPEC.md`'s existing requirement — `docker-build`'s job only proves the image builds, not that it can start correctly, which is intentional.

## Deployment artifacts

- **`Dockerfile`** — multi-stage: install + build in one stage, copy only the built output + production `node_modules` into a slim runtime stage, `@sveltejs/adapter-node` entrypoint (`node build/index.js`). No secrets baked in anywhere.
- **`docker-compose.prod.yml`** — as already specified in `docs/SPEC.md`'s deployment section: app image + Postgres + Valkey + a migration one-shot service that must exit 0 before the app starts + a TLS-terminating reverse proxy; Postgres and Valkey on an internal network with no published ports; `/healthz` (Foundation) wired to compose healthchecks so the proxy never routes to a booting app; secrets from the environment at runtime.
  - **Reverse proxy: Caddy.** `docs/SPEC.md` named the requirement (TLS termination, don't rewrite/redirect `/.well-known/nostr.json`, preserve the CORS header) but not a specific proxy. Caddy over nginx or Traefik: automatic TLS certificate provisioning/renewal with a few lines of config, versus nginx needing a separate certbot setup or Traefik's heavier configuration surface for what's a single-app deployment — the simplest tool that satisfies the actual requirement, consistent with the project's stated "simplicity" principle.

## Testing

There's no meaningful way to unit-test a GitHub Actions YAML file locally. The real verification is pushing a branch and watching an actual run in the Actions tab — the plan's own final task treats that as the real test, not a stand-in for one.
