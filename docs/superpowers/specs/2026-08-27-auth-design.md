# Auth (NIP-07/NIP-46 challenge-response) — Design

Sub-project 2 of the Phostrich build order (see `docs/SPEC.md` for full product/architecture context, and `docs/superpowers/specs/2026-08-27-foundation-design.md` for the Foundation slice this depends on). This sub-project is the auth **backend only**: challenge issuance, signature verification, session creation/destruction, rate limiting. It has no UI — the login screen that actually calls `window.nostr` or a NIP-46 bunker is built in sub-project 3 alongside the claim flow, the first screen behind Impeccable.

## Scope

**In scope:**
- `POST /auth/challenge`, `POST /auth/verify`, `POST /auth/logout`
- Session storage and sliding-TTL renewal via `src/hooks.server.ts`
- Rate limiting on the challenge/verify endpoints
- `SESSION_TTL_DAYS` config addition

**Explicitly out of scope:**
- Any browser-side signing code (NIP-07 `window.nostr` calls, NIP-46 bunker client) — sub-project 3
- Any UI/Svelte pages, including a throwaway login page
- DM-OTP fallback — remains a separate, undecided question; not touched here
- The claim flow itself, and anything that reads `event.locals.user` to do something — sub-project 3

## Key design insight

`/auth/verify` is signer-agnostic. NIP-07 and NIP-46 both terminate in "here is a pubkey and a signed event" — NIP-46's relay round-trip (browser ↔ bunker) happens entirely client-side and never touches this backend. Consequently there is no NIP-46-specific backend code in this sub-project at all; the distinction between the two signer paths exists only in the not-yet-built browser code.

## The challenge event

Adapted from **NIP-98 (HTTP Auth)**, kind `27235`, rather than repurposing NIP-42 (relay auth — a worse semantic fit) or inventing a custom kind (loses the benefit of matching a NIP a signer library might already construct):

- `tags`: `['u', '<PUBLIC_ORIGIN>/auth/verify']`, `['method', 'POST']`, `['challenge', '<server-issued nonce>']`
- `content`: `''`

Vanilla NIP-98 relies only on a tight `created_at` window for anti-replay; the added `challenge` tag, bound to a server-side Valkey nonce, gives real single-use replay protection on top of that.

## Config addition

`SESSION_TTL_DAYS` — Zod-validated integer, default `30`. Added to the `Config` type and schema established in Foundation's `src/lib/server/config.ts`.

## Components

- `src/lib/server/auth/challenge.ts` — issues and validates challenges against Valkey (`challenge:<pubkey>`, 5 min TTL).
- `src/lib/server/auth/verify.ts` — validates a submitted event: kind, `u`/`method` tags, a ±60 second freshness window on `created_at`, signature (`nostr-tools`' `verifyEvent`), and challenge match. Signer-agnostic, as above.
- `src/lib/server/auth/session.ts` — session create (`session:<id>` in Valkey, sliding TTL) and destroy.
- `src/lib/server/auth/rateLimit.ts` — `checkRateLimit(key, limit, windowSeconds): Promise<boolean>`, Valkey `INCR` + `EXPIRE`-on-first-increment.
- `src/routes/auth/challenge/+server.ts`, `src/routes/auth/verify/+server.ts`, `src/routes/auth/logout/+server.ts`
- `src/hooks.server.ts` — resolves the session cookie into `event.locals.user`, bumps the sliding TTL on every authenticated request.

## Data flow

1. `POST /auth/challenge {pubkey}` (64-hex; malformed → 400 — a structural check, not an account-existence leak) → nonce generated, `challenge:<pubkey>` stored (5 min TTL), returned.
2. Caller signs the kind-`27235` event (out of scope here) and `POST /auth/verify {event}`.
3. Server validates the event fully; any failure (bad signature, wrong kind, `created_at` outside ±60s, missing/mismatched challenge, no challenge issued for that pubkey) → identical generic 401, so no check is distinguishable from another.
4. On success: delete the challenge (single-use) → mint a 32-byte-hex session id → store `session:<id> = {pubkey, createdAt}` with TTL `SESSION_TTL_DAYS` → set `httpOnly; Secure; SameSite=Lax` cookie carrying only the session id.
5. Every request: `hooks.server.ts` reads the cookie, looks up the session, sets `event.locals.user`, refreshes the TTL back to the full window — an active user is never logged out mid-session; an abandoned one expires after `SESSION_TTL_DAYS`.
6. `POST /auth/logout` deletes the session and clears the cookie.

## Error handling

- Malformed `pubkey` on `/auth/challenge` → 400.
- Any `/auth/verify` failure → identical generic 401 (see above).
- Rate limit exceeded → 429, generic body — doesn't reveal which axis (IP or pubkey) tripped.
- **Valkey unreachable → 503, no fail-open.** Unlike the NIP-05 endpoint (where Valkey is a cache in front of Postgres and fails open), Valkey *is* the source of truth for challenges and sessions here — there is no fallback, so an outage means auth is genuinely down.

## Rate limiting

Reusing the axes already named in `docs/SPEC.md`: `ratelimit:challenge:ip:<ip>`, `ratelimit:challenge:pubkey:<pubkey>`, `ratelimit:verify:pubkey:<pubkey>`. Concrete starting numbers: 20/5min per IP and 10/5min per pubkey on `challenge`; 10/5min per pubkey on `verify`. Unlike an OTP, a signature can't be brute-forced, so `verify`'s limit exists to bound malformed-request/DoS traffic, not guessing.

## Testing

- `checkRateLimit`: unit/integration against real Valkey — allows up to N in the window, blocks N+1, resets after the window elapses.
- `/auth/challenge` + `/auth/verify`, integration against real Valkey, signing real events with `nostr-tools` test keypairs (`generateSecretKey`/`getPublicKey`/`finalizeEvent`) — no mocked crypto:
  - happy path: 200, `Set-Cookie` present, session exists in Valkey with the right pubkey.
  - tampered signature, wrong kind, stale `created_at`, missing/mismatched challenge tag, reused challenge (verify called twice), no challenge ever issued for that pubkey — all → the same generic 401.
- `hooks.server.ts`: valid cookie → `locals.user` set and the Valkey TTL is bumped; missing/invalid cookie → `locals.user` is `null`.
- `/auth/logout`: session removed from Valkey, cookie cleared.
- Rate limiting wired into the routes: exceeding the configured limit on `challenge`/`verify` returns 429.
- 90% coverage gate applies, same as Foundation.
