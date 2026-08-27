# Admin Dashboard — Design

Sub-project 5 of the Phostrich build order (see `docs/SPEC.md` for full product/architecture context, and the Foundation/Auth/Claim-flow/Account-management design docs this depends on). Adds the admin report page: a live staleness report with force-release, and reservation management. Extends the established Issued Credential visual world — no new concept round.

## Scope

**In scope:**
- `/admin` — one page, two sections (staleness report + force-release; reservation list + add-form)
- `POST /api/admin/reservations`, `DELETE /api/admin/reservations/[name]`, `POST /api/admin/force-release`
- `ADMIN_PUBKEYS` config field, `isAdmin(pubkey)` helper
- Splitting Claim flow's `isClaimableName` into `isValidNameFormat` + the blocklist check
- Extending `identifierEventType` with `'reserved'` and `'reservation_removed'`

**Explicitly out of scope:**
- Any background job — the staleness report is a **live query**, not fed by a scheduled job. Whether sub-project 6 still needs one at all (its other original purpose, the warning DM, was already cut) is that sub-project's own question, not decided here.
- CI/CD — sub-project 6.

## Auth guard

`ADMIN_PUBKEYS` — new `Config` field: comma-separated hex, same parsing pattern as `DEFAULT_RELAYS`. `isAdmin(pubkey: string): boolean` checks membership.

`/admin`'s load: unauthenticated → redirect `/login`. Authenticated but not admin → `403` (a plain access-control failure, not a disguising redirect — standard and honest, and there's no reason to hide that the route exists from an authenticated non-admin).

## Routes and endpoints

- **`/admin`** — server `load` runs two live queries:
  - Staleness: `identifiers` where `status = 'claimed'` and `last_identified_at` older than 6 months, sorted oldest-first.
  - Reservations: `identifiers` where `status = 'reserved'`.
- **`POST /api/admin/reservations`** — admin only. Body `{name, reason}`. Validates via `isValidNameFormat` only — **not** the reserved-pattern blocklist, since an admin reservation is a distinct, complementary mechanism (an admin can reserve a name that isn't pattern-blocked at all, e.g. for a trademark holder). Inserts the row (`status: 'reserved'`, no owner) plus an `identifier_events` row (`eventType: 'reserved'`, the given `reason`). `409` if the name already has any row — specifically stating why (claimed vs. already reserved), since an admin already sees the full picture in the report; the project's "don't reveal more than necessary" principle protects against strangers probing the system, not trusted admins using it.
- **`DELETE /api/admin/reservations/[name]`** — admin only. Deletes only if `status = 'reserved'` (the query is scoped so it can never delete a claimed row), writes `eventType: 'reservation_removed'`. `404` if no matching reserved row exists.
- **`POST /api/admin/force-release`** — admin only. Body `{name, reason}` — **reason required**, per `docs/SPEC.md`. Re-verifies staleness server-side inside the same transaction before deleting, rather than trusting a possibly-stale report snapshot the admin is looking at — defends against a race where the owner re-verifies their identifier right as the admin acts. On success: delete the row, insert `eventType: 'force_released'` (with the reason), invalidate the cache. `409` with a specific "no longer eligible, last verified `<date>`" message if the re-check finds it's not actually stale anymore.

## Data model

One migration: `identifierEventType` gains `'reserved'` and `'reservation_removed'`. Nothing else changes — no new tables, no changes to `identifiers`.

## Refactor: splitting `isClaimableName`

`src/lib/server/identifiers/reservedPatterns.ts` (Claim flow, not yet executed) currently exports one function that checks format, exact-reserved, and pattern-reserved together. This sub-project splits it:
- `isValidNameFormat(name): boolean` — length, charset, leading/trailing separator, consecutive-dot rules only.
- `isClaimableName(name): boolean` — unchanged behavior: `isValidNameFormat(name) && !reserved-exact && !reserved-pattern`.

Claim flow's existing tests for `isClaimableName` must keep passing unchanged after the split — that's the proof the refactor preserved behavior. The admin reservation endpoint uses only `isValidNameFormat`.

## Visual direction

Extends Issued Credential, no new concept round (per Impeccable's "extend an existing surface" path — the world is already established):

- The report becomes **ruled rows** — each record its own ruled table row, the tabular counterpart to the single-record ruled-field pattern already used on `/account`.
- The reservation add-form reuses that same ruled-field pattern (one fact per ruled line, as elsewhere).
- Force-release and reservation-remove both use the existing hard-interrupt modal pattern (claim policy, account release). Force-release's modal includes the required reason field itself, not a separate step.
- No new colors, no new type, no new restraint discipline — same navy/cream/oxblood, same single-hairline-accent rule.

## Error handling

- Non-admin authenticated → `403`.
- Reservation create: format-invalid → `400` (specific); name conflict → `409` (specific).
- Reservation remove: `404` if not a reserved row.
- Force-release: `409` with a specific message if the re-check finds it's no longer stale.
- Cache invalidation stays fail-open, same as every other write path in the project.

## Testing

- `config.ts`'s `ADMIN_PUBKEYS` parsing, `isAdmin()` — unit tests.
- The `isClaimableName` split: `isValidNameFormat` gets its own tests; Claim flow's existing `isClaimableName` tests must keep passing unchanged.
- All four backend surfaces: admin guard (403/redirect), happy path, each conflict/validation case — real Postgres, no mocks, same as every prior sub-project.
- **E2E environment note**: the existing e2e tests generate a fresh random keypair per run, but an admin e2e test needs its pubkey already present in `.env`'s `ADMIN_PUBKEYS` before the server starts. This test therefore needs a **fixed, checked-in test keypair** rather than a random one, with that specific pubkey added to `.env.example`'s `ADMIN_PUBKEYS`. Called out explicitly here so it isn't a mysterious e2e failure at implementation time.
- 90% coverage gate applies; `.svelte` files stay excluded, same convention as every prior sub-project.
