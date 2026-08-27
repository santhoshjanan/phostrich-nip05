# Phostrich

A NIP-05 identifier provider. See `docs/SPEC.md` for the full product/architecture spec.

## Local development

    cp .env.example .env
    docker compose up -d
    pnpm install
    pnpm db:migrate
    pnpm db:seed
    pnpm dev

The NIP-05 endpoint is then available at:

    curl "http://localhost:5173/.well-known/nostr.json?name=alice"

## Testing

`docker compose up -d` (Postgres + Valkey) must be running before `pnpm test`.

    pnpm test           # watch mode
    pnpm test:coverage  # single run with the 90% coverage gate

Running the test suite clears the seeded fixture rows (they share names with the dev seed
data) — re-run `pnpm db:seed` afterward if you need them back for manual testing.

## Auth

Backend-only in this slice — no login UI yet. The flow:

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

New env for e2e only: `PUBLIC_ORIGIN` must match wherever `pnpm preview` actually serves (default `http://localhost:4173`), since the client's signed auth event and the server's check of it both depend on this value matching exactly.

## Other commands

    pnpm check        # svelte-check + TypeScript
    pnpm lint          # eslint
    pnpm format:check  # prettier --check
    pnpm build          # production build
