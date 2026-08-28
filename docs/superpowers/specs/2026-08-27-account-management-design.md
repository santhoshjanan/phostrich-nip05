# Account Management — Design

Sub-project 4 of the Phostrich build order (see `docs/SPEC.md` for full product/architecture context, and the Foundation/Auth/Claim-flow design docs this depends on). Adds the persistent account page: relay list editing, release, and inactivity status display. Extends the already-established Issued Credential visual world from the Claim flow sub-project — no new concept tournament, per Impeccable's own "extend an existing surface" path.

## Scope

**In scope:**
- `/account` — identifier display, relay editing, inactivity status, release
- `PUT /api/account/relays`, `POST /api/account/release`
- `src/lib/server/identifiers/account.ts` — owner-scoped account mutation services, plus the shared relay-list validator
- Amending Claim flow's `/claim` redirect target (already-owns-one case: `/claimed` → `/account`)

**Explicitly out of scope:**
- Admin dashboard, reservation management, force-release, and the live staleness report — sub-project 5

**No new migration needed.** `identifier_events.eventType` already includes `'released'` — Claim flow's schema anticipated this.

## Routes and endpoints

- **`/account`** — server `load`: redirect `/login` if unauthenticated; redirect `/claim` if the user owns no claimed identifier; otherwise loads the identifier name, `relays`, and `last_identified_at`. Renders the identifier (read-only), editable relay rows, the inactivity status, and the release action.
- **`PUT /api/account/relays`** — auth required. The thin route validates request shape then calls `saveOwnedRelays(ownerPubkey, relays, { allowInsecure })` in `src/lib/server/identifiers/account.ts`. That service validates the list, conditionally updates only a `status = 'claimed'` row owned by the caller, obtains its name with `RETURNING`, then invalidates after commit. A zero-row result is `not_found`; no cache is invalidated. Validation errors are specific (`"relay 2: must start with wss://"`), unlike the claim/availability endpoints' deliberately vague responses.
- **`POST /api/account/release`** — auth required, no body. The thin route calls `releaseOwnedIdentifier(ownerPubkey)` in `src/lib/server/identifiers/account.ts`. One transaction conditionally deletes only a `status = 'claimed'` row owned by the caller with `DELETE ... RETURNING`; when a row is returned, it inserts the `released` audit event with the caller and `reason: null` in that same transaction. A zero-row result writes no audit event and maps to 404. Cache invalidation is fail-open and occurs only after a successful commit.

**Amendment to Claim flow:** `/claim`'s server load, in the "already owns a claimed identifier" branch, now redirects to `/account` instead of `/claimed`. `/claimed` stays purely the one-time post-claim confirmation; `/account` is the ongoing management home.

## `validateRelayList`

`src/lib/server/identifiers/relays.ts`, shared by the route and (indirectly, by validating the same shape) anything else that ever needs to check a relay list:

- Cap: 8 relays.
- Scheme: `wss://` required; `ws://` permitted only when `NODE_ENV !== 'production'`.
- Must be a parseable URL with no userinfo (`user:pass@`) and no query string.
- Deduplicated after normalizing the trailing slash; order preserved (first occurrence wins).

## Data flow

Edit relay rows client-side (add/remove/edit) → mark the draft dirty and clear stale success/errors → Save → total request helper → thin route → `saveOwnedRelays()` → page replaces the draft with normalized relays. Indexed `relay N: …` errors attach to the matching input; other errors remain section-level. Release → hard-interrupt confirmation → total request helper → thin route → `releaseOwnedIdentifier()` → on success, redirect to `/claim`.

## Inactivity status display

Always shown together, same calm tone, no urgent color escalation (consistent with the direction's single-hairline-accent restraint and the "disclose policy up front, not as a surprise" product principle):
- **Last NIP-05 lookup:** `last_identified_at`, formatted date, with helper copy that public lookup activity determines eligibility.
- **Eligible for release after:** `last_identified_at` + 6 months, formatted date.

Both computed client-side from `last_identified_at` returned by the load function — no new backend computation needed, since the 6-month constant is already fixed (`docs/SPEC.md`).

## Error handling

- Client request helpers are total: rejected fetches, aborts, and unusable error bodies become concise user-safe failures; raw exception text is never rendered. Saving/releasing state is always cleared defensively; a failed release leaves the dialog usable.
- Indexed relay errors set `aria-invalid` and `aria-describedby` on the associated row; non-indexed errors remain at section level.
- The release dialog focuses Cancel on open, contains Tab and Shift+Tab, closes on Escape only while idle, and restores focus after Cancel, Escape, or a failed release.
- `PUT /api/account/relays` → 401 unauthenticated; specific validation-error messages (see above) otherwise.
- `POST /api/account/release` → 401 unauthenticated; 404 if the caller owns nothing.
- `invalidateIdentifier` failures stay fail-open, same as every other write path in the project — a stale cache entry self-heals via its TTL.

## Visual direction

Extends the Issued Credential world using canonical lavender/plum/paper tokens and system-sans operational text rather than introducing new material:

- Relay list: **individual ruled rows**, one relay per row with its own remove action, plus an "add relay" action below the last row — matches the document metaphor's "one fact per ruled line" and makes per-row validation errors easy to place inline. (Considered and rejected: a single free-form textarea — faster to bulk-edit, but breaks the ruled-field metaphor and makes per-line errors awkward to place.)
- Release confirmation: an explicit modal, no outside-click dismiss, requiring an affirmative action — the same hard-interrupt pattern already established for the claim-time expiry modal, not a heavier "type the name to confirm" flow, which would be disproportionate given the modal already states the consequence plainly.
- Inactivity status: two calm evidentiary lines (as above), not a warning badge or color shift — consistent with the "evidence-framed states" discipline the Claim flow direction already committed to.

## Testing

- `validateRelayList`: unit tests — cap, `wss://` requirement, dev-only `ws://` allowance, dedupe, parseable-URL/userinfo/query-string rejection.
- `saveOwnedRelays()` and `releaseOwnedIdentifier()`: owner/status predicates, `RETURNING`, same-transaction release audit, and former-owner/reclaimed-name regressions with real Postgres/Valkey. Route tests cover only authentication, request-shape, and result-to-status mapping; their SvelteKit-safe names are `server.test.ts` and `page.server.test.ts`.
- `/account` load: auth guard, redirect-to-`/claim` when nothing owned, correct data shape (identifier, relays, both computed dates).
- Playwright e2e: extend the existing claim-flow scenario — after claiming, exercise dirty/saved feedback, indexed validation, rejected requests, keyboard dialog behavior, then release, reusing the fake-`window.nostr` sign-in pattern already built in Claim flow's e2e test.
- 90% coverage gate applies; `.svelte` files stay excluded per Claim flow's existing Vitest config.
