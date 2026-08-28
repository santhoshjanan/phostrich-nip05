# Account and Admin Stabilization — Design

Stabilizes Account Management and reconciles the Admin Dashboard contract before Admin tasks 5–12 begin. This document amends the Account Management and Admin Dashboard sub-project documents where they conflict with `docs/SPEC.md` or with the security and accessibility requirements established here.

## Goal

Make Account Management safe under release-and-reclaim races, restore truthful and accessible account interactions, return all required verification gates to green, and remove contradictions from the Admin Dashboard plan before its remaining features are implemented.

## Scope

**In scope:**

- Atomic, owner-scoped relay editing and identifier release.
- Moving privileged account mutation workflows into `src/lib/server/**`.
- Deterministic regression coverage for requests made by a former owner after a name has been reclaimed.
- Account request failure handling, relay draft feedback, indexed validation presentation, and release-dialog focus lifecycle.
- Accurate NIP-05 lookup activity language on `/account`.
- Lint and formatting baseline repair.
- Reconciliation of Admin Dashboard staleness, transaction, route-test naming, visual-token, and verification requirements.

**Out of scope:**

- Admin Dashboard tasks 5–12 themselves.
- Autosave, bulk relay editing, unsaved-navigation interception, or a new component framework.
- Schema revisions, ownership-version columns, row-lock tables, or transactional cache writes.
- New colors, typography, or a replacement account-page visual direction.

## Security and server architecture

Account mutation routes stay thin as required by `docs/SPEC.md`: authenticate, parse request shape, call one server operation, and map its domain result to HTTP. Privileged validation, database mutation, audit logging, and cache invalidation live in a focused account service under `src/lib/server/identifiers/`.

### Relay editing

The service validates the complete relay list, then performs one conditional update whose SQL predicate includes the authenticated owner pubkey and `status = 'claimed'`. It uses `RETURNING` to obtain the mutated identifier name. A zero-row result returns the existing not-found domain outcome; it does not invalidate any cache entry.

The mutation must not depend on a name read during a separate preliminary authorization query. This preserves the invariant that a former owner cannot change a row created by a later claimant.

After a successful update commits, the service calls the existing fail-open `invalidateIdentifier(name)` helper and returns the normalized relays.

### User release

The service starts one database transaction and conditionally deletes a row where `owner_pubkey` equals the authenticated caller and `status = 'claimed'`, returning the deleted name. If no row is returned, the transaction writes no audit event and returns not found.

When a row is returned, the same transaction inserts exactly one `identifier_events` record with `eventType = 'released'`, `actorPubkey` equal to the caller, and `reason = null`. Cache invalidation occurs only after commit and only for a successful delete.

This eliminates the release/reclaim time-of-check/time-of-use window without adding schema state or locking infrastructure.

## Server testing

Service integration tests use real Postgres and Valkey, unique fixtures, and explicit cleanup.

Required reclaimed-name regressions are deterministic:

1. Create a claimed identifier for an old owner.
2. Delete it and recreate the same name for a new owner with known data.
3. Invoke the service as the old owner.
4. Assert not found, assert the new owner's row and relays are unchanged, assert no old-owner release audit event exists, and assert a failed operation does not invalidate the new owner's cache entry.

Route tests retain authentication and request-shape coverage and verify result-to-status mapping. Persistence, audit, and cache assertions belong to the service tests.

## Account interaction hardening

The account page remains an extension of the existing Issued Credential visual system. This pass changes behavior and clarity, not the visual world.

### Total request results

Client account request helpers convert network rejection, aborted fetches, and unusable error responses into the existing failure-result shape with concise user-safe copy. Raw exception text is never rendered.

Callers use defensive cleanup so save and release state cannot remain `saving` or `releasing` after a failed request. A failed release keeps the dialog open and usable.

### Truthful relay draft state

Adding, editing, or removing a relay marks the local draft dirty. Any previous `Saved` confirmation and stale validation state are cleared. Saving successfully replaces the draft with the server-normalized list and restores the saved state.

This pass does not add autosave or navigation interception.

### Indexed relay errors

The server's established `relay N: …` error contract is preserved. Because blank visible rows are omitted from the submitted array, the page snapshots a submitted-index-to-visible-index mapping with each save and translates the one-based server index through it. It then associates the message with that visible input through `aria-invalid` and `aria-describedby`, and renders the recovery message adjacent to the row. Non-indexed transport or section errors remain at section level.

The relay section states that entries are public, accepts `wss://`, and shows the current count out of eight without introducing a new panel or badge treatment.

### Release dialog

The release confirmation remains a hard interruption: no outside-click dismissal and an explicit affirmative action.

On open, it records the launcher and focuses the safe Cancel action. Tab and Shift+Tab remain within the dialog. Escape closes the dialog only while no release request is in flight. Cancel, Escape, and a failed release restore an appropriate focus target; a successful release navigates to `/claim`.

The implementation may use a small local client helper or Svelte action. It must not add a dialog dependency solely for this surface.

### Inactivity language

`last_identified_at` represents successful public NIP-05 lookup activity, not authentication or ownership verification. The account evidence label becomes `Last NIP-05 lookup`, with calm helper copy explaining that public lookup activity determines release eligibility. The paired six-calendar-month eligibility date and non-alarming presentation remain unchanged.

## Admin Dashboard contract reconciliation

### Six calendar months

The stale report and force-release eligibility use one shared server query condition based on PostgreSQL calendar arithmetic: `last_identified_at + interval '6 months' < now()`. No `6 * 30 days` millisecond constant is permitted. Addition is binding because PostgreSQL month-clamps: August 31 plus six months is February 28; subtracting six months from February 28 is not equivalent.

Boundary tests cover literal just-inside and just-outside six-calendar-month addition boundaries, including month-end and leap-year cases. Report and force-release must consume the same eligibility definition.

### Live report; no scheduled scan job

The Admin Dashboard's staleness report is a live database query. The earlier `docs/SPEC.md` requirement for a daily scheduled scan is superseded: there is no warning channel, materialized report, or automatic release for such a job to produce. Avoiding a redundant job removes duplicate eligibility logic and keeps force release based on current database state.

`docs/SPEC.md` and the Admin Dashboard design/plan must be updated together to state this decision.

### Atomic destructive admin writes

Reservation removal conditionally deletes only `status = 'reserved'` and inserts `reservation_removed` in the same transaction.

Force release rechecks the shared six-calendar-month predicate and conditionally deletes the claimed identifier inside the same transaction that inserts `force_released`. It writes no audit event when eligibility fails. Cache invalidation remains fail-open and occurs only after commit.

Reservation creation and force release trim their required reason in the server service, reject empty-after-trim values, and persist the trimmed value. Client-side trimming only aligns affordances; it is never the enforcement boundary.

### Plan and UI corrections

- Route-adjacent tests use `server.test.ts` and `page.server.test.ts`; filenames beginning with `+` remain reserved for SvelteKit route modules.
- Admin UI uses canonical tokens from `DESIGN.md`, including `--font-ui`, `--color-line`, and existing rose/mint text tokens. Undefined navy/cream/oxblood tokens and whole-table monospace styling are removed from the plan.
- Admin destructive dialogs expose visible headings and consequence descriptions through `aria-labelledby` and `aria-describedby`, and the client uses typed total helpers plus pending/finalizer guards for every write.
- Tasks 1–4 are recorded as completed prerequisites. No duplicate configuration, helper, enum migration, or validation-split work is generated.
- Final Admin verification includes formatting, lint, Svelte/type checks, coverage, build, and Playwright, with expected counts derived from the tests that actually exist.

## Verification and formatting

The obsolete account-page Svelte suppression is removed rather than replaced unless a current tool emits the suppressed diagnostic.

Formatting repair is isolated as a mechanical change. Generated Impeccable critique archives are excluded from source-format verification rather than rewritten as application source. Existing user-authored changes are preserved.

Required stabilization gates:

- Focused red/green service and client tests for each corrected behavior.
- `pnpm format:check`.
- `pnpm lint`.
- `pnpm check`.
- `pnpm test:coverage` with the documented environment and real Postgres/Valkey.
- `pnpm build` with the documented environment.
- Account Playwright coverage for draft feedback, indexed errors, rejected requests, and dialog keyboard behavior when the browser environment is available.

If local browser system dependencies remain unavailable, the exact Playwright blocker is reported; non-browser gates do not substitute for e2e verification.

## Execution order

1. Correct account mutation atomicity and route layering.
2. Harden account request and draft-state behavior.
3. Complete indexed validation, dialog accessibility, and inactivity copy.
4. Repair lint/formatting and reconcile source specifications and the Admin plan.
5. Run a full verification pass and independent whole-branch review.

Admin Dashboard task 5 begins only after step 5 has no unresolved critical or important findings.
