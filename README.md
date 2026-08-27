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

## Other commands

    pnpm check        # svelte-check + TypeScript
    pnpm lint          # eslint
    pnpm format:check  # prettier --check
    pnpm build          # production build
