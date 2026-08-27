# Claim Flow (first UI) — Design

Sub-project 3 of the Phostrich build order (see `docs/SPEC.md` for full product/architecture context, `docs/superpowers/specs/2026-08-27-foundation-design.md` and `2026-08-27-auth-design.md` for the two sub-projects this depends on). This is the first UI in the product: the login screen (calling the Auth backend), the claim form, and a confirmation screen. Visual/product context lives in `PRODUCT.md` (written for this sub-project via Impeccable's `init`) — this document does not repeat it.

## Scope

**In scope:**
- `/login`, `/claim`, `/claimed` — three screens, Issued Credential visual direction (see below)
- `GET /api/identifiers/availability`, `POST /api/identifiers/claim`
- `identifier_events` audit table (deferred here by Foundation's design)
- `invalidateIdentifier(name)` on `src/lib/server/db/identifiers.ts` (deferred here by Foundation's design)
- A partial unique index enforcing one claimed identifier per `owner_pubkey`
- `src/lib/server/identifiers/reservedPatterns.ts` — the reserved-name blocklist and format rules
- The first Playwright e2e test in the project

**Explicitly out of scope:**
- Account management (relay editing, release, inactive-status display) — sub-project 4
- Admin dashboard, reservation management — sub-project 5
- The NIP-46 bunker client library integration details beyond "it produces a signed event the same way NIP-07 does" — the actual `nostr-tools/nip46` wiring is an implementation-plan concern, not a design one, since the design doc's job is behavior and interfaces, not library call sequences

## Visual direction: Issued Credential

Selected via Impeccable's `shape` → `new-work` direction process (`concept-seed.mjs --scope direction --mode operate`, assigned index 5 of 7 grounded candidates drawn from this audience's world — WHOIS records, Unix `/etc/passwd`, signed-commit ledgers, ham radio callsign licenses, issued credentials, BBS handle registration, library card catalogs). Fused against six catalog challengers; none won outright, one (a quiet scientific-observation aesthetic) was competitive on restraint/precision and donated two disciplines without donating its imagery. No image comps were possible in this environment (no image-generation tool, no API key configured) — the direction is committed in writing; the eventual build's finish review audits against this text, and `DESIGN.md` is written from the real build afterward, not before it, per Impeccable's own process. Build path: **code-led**.

**Thesis:** claiming a NIP-05 identifier reads as being issued an official, verifiable credential — not filling out a signup form.

- **Palette/material:** navy/cream/oxblood ink on a pale document ground. Color is a single hairline accent ink, never a broad saturated field.
- **Type:** an engraved-serif display face for the identifier itself; a precise mono for pubkey/timestamps/technical metadata.
- **Layout:** a single-column, centered "document" card, consistent across all three screens — ruled fields with serial-style labels (`NAME`, `ISSUED`, `STATUS`).
- **Signature moment:** a stamped-seal motif, reserved for the successful-claim state only — it does not appear anywhere else, so it stays meaningful.
- **Unavailable/void state discipline** (raised from a declined challenger's "absence is designed too" principle): an unavailable name renders as a deliberately voided or struck ruled line, not a generic red error color.
- **Evidence-framed states** (raised from the competitive challenger's restraint discipline): the availability check reads as a short evidentiary label ("available" / "not available") in the accent ink, not a colored badge or icon. The NIP-46 timeout state is drawn as a field visibly mid-issuance, not a spinner.
- **Anti-goals:** no crypto-dashboard/glassmorphism/neon aesthetic, no cheerful onboarding-wizard illustration, no literal aged-paper/antique costume — spare and modern, not pastiche.

## Screens

- **`/login`** — auto-detects `window.nostr`. Present: one "Sign in with extension" button (NIP-07). Absent: a field to paste a `bunker://…` URI (NIP-46), with a visible ~30s timeout and a retry action — never an indefinite spinner. Redirects to `/claim` if already authenticated.
- **`/claim`** — name input with live, debounced (~400ms) availability checking. Server-side load redirects to `/claimed` if the authenticated user already owns a claimed identifier (enforcing the one-per-pubkey rule at the UI level, not only the DB). On submitting an available name, the expiry-policy modal is a hard interrupt (not dismissible by outside click) stating the 6-month inactivity policy in plain terms, requiring an affirmative "I understand, claim this name" before the claim actually fires.
- **`/claimed`** — the claimed identifier, a copy-to-clipboard button with explicit label-change feedback (not just an icon flash), and a note that account/relay management is coming later.

## Backend

- **`GET /api/identifiers/availability?name=X`** → `{available: boolean}`, never a reason. Folds together: an existing row (any status — claimed, reserved, or blocked, all read the same "unavailable" from outside), the pattern-blocklist, and the format rules below. Rate-limited per IP (60/5min — generous, since it's typed-as-you-go and low-stakes).
- **`POST /api/identifiers/claim`** — requires `locals.user`. Attempts the insert directly inside a transaction that also writes the `identifier_events` row (`eventType: 'claimed'`), no check-then-write race. Calls `invalidateIdentifier(name)` after commit. A unique-constraint conflict on **name** → generic "not available" (identical wording to the availability check). A conflict on the **owner partial-unique-index** (only reachable via a race, e.g. a double-submit) → a distinct, specific message — revealing this to the user about their own state isn't a leak the way revealing it about another name would be.

**Format rules** (deferred here by Foundation's design, shared by both endpoints via one validator in `reservedPatterns.ts`): lowercase, `^[a-z0-9._-]+$`, length 2–30 characters, no leading/trailing separator character, no consecutive dots.

**Reserved-name blocklist** (`src/lib/server/identifiers/reservedPatterns.ts`, code-reviewed, documented as an extensible starter set, not exhaustive):
- Platform-protection (exact): `admin`, `support`, `help`, `contact`, `security`, `abuse`, `phostrich`, `www`, `api`, `root`, `moderator`, `mod`, `staff`, `official`, `noreply`, `postmaster`, `webmaster`, `sysadmin`
- Generic/impersonation-prone (exact): `info`, `news`, `test`, `null`, `undefined`, `anonymous`, `everyone`, `nobody`, `system`, `service`, `bot`
- Government, prominent (exact): `whitehouse`, `fbi`, `cia`, `nsa`, `potus`, `congress`, `senate`, `un`, `nato`, `treasury`, `irs`, `pentagon`; plus a pattern `/(^|[._-])gov([._-]|$)/i` for variants like `us-gov` without false-positiving on words like `governor`
- Major companies, likely-impersonated (exact): `google`, `apple`, `microsoft`, `amazon`, `meta`, `facebook`, `twitter`, `x`, `tesla`, `openai`, `anthropic`, `binance`, `coinbase`, `kraken`
- `_` is already handled by Foundation/SPEC.md as the platform's own root identifier, not part of this blocklist — it's excluded from the claimable pool structurally, not by pattern match.

## Data model additions

- `identifiers`: add a **partial unique index on `owner_pubkey` where `status = 'claimed'`** — the one-per-pubkey cap enforced by Postgres itself, the same principle Foundation already applied to name uniqueness, not just an app-level pre-check that a race could defeat.
- **`identifier_events`** (new table): `id`, `identifierName` (text snapshot — **not** a foreign key, since release/force-release in later sub-projects can outlive the identifier row and this table must survive that), `eventType` (`claimed`\|`released`\|`force_released`), `actorPubkey`, `reason` (nullable), `createdAt`.
- `src/lib/server/db/identifiers.ts` gains `invalidateIdentifier(name)`.

## Data flow

`/claim` unauthenticated → redirect `/login` → NIP-07 or NIP-46 signs the challenge (Auth's existing contract) → cookie set → redirect `/claim`. Server-side load checks whether `locals.user` already owns a claimed identifier → redirect `/claimed` if so. Otherwise: type a name → debounced `GET .../availability` → pick an available one → policy modal → confirm → `POST .../claim` → `201` → redirect `/claimed`.

## Error handling

- Unauthenticated `POST /api/identifiers/claim` → 401 JSON; the client catches this and redirects to `/login`.
- Availability endpoint never 400s on malformed input — returns `{available: false}`, same "always a clean response" posture as the public NIP-05 endpoint.
- Claim conflict on **name** → generic "not available" (matches the availability check's wording).
- Claim conflict on the **owner cap** → distinct, specific message.
- `invalidateIdentifier` failing doesn't fail the claim — Foundation's cache-write already fails open internally; worst case the public endpoint serves a stale negative-cache entry for up to its 30s TTL, then self-heals.
- NIP-46 timeout (~30s) surfaces visibly with a retry action, per the visual direction's "field visibly mid-issuance" treatment — never an indefinite spinner.

## Testing

- Backend: availability endpoint (format rules, pattern blocklist, existing row, happy path) and claim endpoint (happy path incl. audit row + invalidation call, name conflict, owner-cap conflict, unauthenticated → 401) — real Postgres/Valkey, no mocks, consistent with the other two sub-projects.
- **First real Playwright e2e in the project**: sign in by injecting a fake `window.nostr` (a real test keypair signing real events via `nostr-tools` — this fakes "an extension is installed," never the cryptography itself), claim a name, land on `/claimed`.
- 90% coverage gate applies, same as Foundation and Auth.
