# Account and Admin Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Account Management ownership races, harden its interaction states and release dialog, restore verification gates, and reconcile the Admin Dashboard contract before tasks 5–12 resume.

**Architecture:** A focused account service owns validation, conditional mutations, auditing, and post-commit cache invalidation while route files only parse and map. Account UI behavior is tested through request-helper unit tests and a mounted real Svelte component in Happy DOM. Contract corrections update the source specs and existing Admin plan without implementing Admin tasks 5–12.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript strict, Drizzle ORM, Postgres, Valkey, Vitest/Happy DOM, Playwright, ESLint, Prettier.

**Spec:** `docs/superpowers/specs/2026-08-27-account-admin-stabilization-design.md`

## Global Constraints

- Privileged validation, database mutation, audit logging, and cache invalidation live in `src/lib/server/**`; account routes authenticate, parse, call, and map only.
- Pubkeys remain 32-byte lowercase hex and every account mutation predicates on the authenticated owner and `status = 'claimed'` in the mutation statement itself.
- User release deletes and writes its `released` event in one transaction; cache invalidation occurs only after commit and remains fail-open.
- Relay edits preserve the current API shape and validator behavior: at most 8, `wss://` in production, dev-only `ws://`, no credentials/query, normalized trailing slash, stable first-occurrence order.
- Account UI remains in the incumbent Issued Credential visual system and preserves no-outside-click release dismissal.
- `last_identified_at` is described as public NIP-05 lookup activity; eligibility remains six calendar months later.
- Admin staleness uses PostgreSQL calendar arithmetic, `last_identified_at < now() - interval '6 months'`, through one shared future server condition.
- Generated Impeccable artifacts are excluded from source formatting and are not committed with application changes.
- All production behavior changes follow red-green-refactor. Test names state the production break they catch and assert real observable behavior.

---

## File Structure

```text
src/lib/server/identifiers/
  account.ts                         — owner-scoped account mutations
  account.test.ts                    — real Postgres/Valkey service tests
src/routes/api/account/relays/
  +server.ts                         — thin PUT adapter
  server.test.ts                     — HTTP mapping tests
src/routes/api/account/release/
  +server.ts                         — thin POST adapter
  server.test.ts                     — HTTP mapping tests
src/lib/client/
  accountForm.ts                     — total transport result helpers
  accountForm.test.ts                — transport and indexed-error unit tests
src/routes/account/
  +page.svelte                       — truthful draft state and accessible dialog
  page.test.ts                       — mounted real-component interaction tests
docs/SPEC.md                         — live-report decision
docs/superpowers/specs/
  2026-08-27-account-management-design.md
  2026-08-27-admin-dashboard-design.md
docs/superpowers/plans/
  2026-08-27-account-management.md
  2026-08-27-admin-dashboard.md
.prettierignore                      — exclude generated Impeccable artifacts
```

---

### Task 1: Atomic account service and thin routes

**Files:**
- Create: `src/lib/server/identifiers/account.ts`
- Create: `src/lib/server/identifiers/account.test.ts`
- Modify: `src/routes/api/account/relays/+server.ts`
- Modify: `src/routes/api/account/relays/server.test.ts`
- Modify: `src/routes/api/account/release/+server.ts`
- Modify: `src/routes/api/account/release/server.test.ts`

**Interfaces:**
- Consumes: `validateRelayList`, `db`, `identifiers`, `identifierEvents`, `invalidateIdentifier`.
- Produces: `saveOwnedRelays(ownerPubkey: string, relays: string[], options: { allowInsecure: boolean }): Promise<SaveOwnedRelaysResult>`.
- Produces: `releaseOwnedIdentifier(ownerPubkey: string): Promise<ReleaseOwnedIdentifierResult>`.
- `SaveOwnedRelaysResult` is `{ ok: true; name: string; relays: string[] } | { ok: false; reason: 'invalid_relays'; error: string } | { ok: false; reason: 'not_found' }`.
- `ReleaseOwnedIdentifierResult` is `{ ok: true; name: string } | { ok: false; reason: 'not_found' }`.

- [ ] **Step 1: Write failing service tests for stale-owner relay protection**

Add a real-database test with literal fixtures:

```ts
const OLD_OWNER = '1'.repeat(64);
const NEW_OWNER = '2'.repeat(64);
const RELAY_NAME = 'account-service-relays-test';

it('does not change a reclaimed identifier when a former owner saves relays', async () => {
  await db.insert(identifiers).values({
    name: RELAY_NAME,
    status: 'claimed',
    ownerPubkey: NEW_OWNER,
    relays: ['wss://new-owner.example/']
  });
  await valkey.set(
    'identifier:' + RELAY_NAME,
    JSON.stringify({ pubkey: NEW_OWNER, relays: ['wss://new-owner.example/'] }),
    'EX',
    300
  );

  await expect(
    saveOwnedRelays(OLD_OWNER, ['wss://former-owner.example'], { allowInsecure: false })
  ).resolves.toEqual({ ok: false, reason: 'not_found' });

  const [row] = await db.select().from(identifiers).where(eq(identifiers.name, RELAY_NAME));
  expect(row).toMatchObject({ ownerPubkey: NEW_OWNER, relays: ['wss://new-owner.example/'] });
  expect(await valkey.get('identifier:' + RELAY_NAME)).not.toBeNull();
});
```

Cleanup deletes service fixture events before identifiers, deletes both service fixture names, and deletes both cache keys. This test catches a mutation that omits the owner predicate.

- [ ] **Step 2: Run the relay service test and verify RED**

Run:

```bash
set -a; source .env.example; set +a
pnpm vitest run src/lib/server/identifiers/account.test.ts -t "former owner saves relays"
```

Expected: FAIL because `account.ts` does not exist.

- [ ] **Step 3: Implement the minimal owner-scoped relay operation**

Create the exact service boundary and use a conditional update with `returning`:

```ts
export type SaveOwnedRelaysResult =
  | { ok: true; name: string; relays: string[] }
  | { ok: false; reason: 'invalid_relays'; error: string }
  | { ok: false; reason: 'not_found' };

export async function saveOwnedRelays(
  ownerPubkey: string,
  relays: string[],
  options: { allowInsecure: boolean }
): Promise<SaveOwnedRelaysResult> {
  const validation = validateRelayList(relays, options);
  if (!validation.ok) return { ok: false, reason: 'invalid_relays', error: validation.error };

  const [updated] = await db
    .update(identifiers)
    .set({ relays: validation.relays, updatedAt: new Date() })
    .where(and(eq(identifiers.ownerPubkey, ownerPubkey), eq(identifiers.status, 'claimed')))
    .returning({ name: identifiers.name });

  if (!updated) return { ok: false, reason: 'not_found' };
  await invalidateIdentifier(updated.name);
  return { ok: true, name: updated.name, relays: validation.relays };
}
```

There is no preliminary ownership query and no name-only mutation.

- [ ] **Step 4: Run the relay service test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write failing service tests for stale-owner release and successful atomic audit**

Add both behaviors:

```ts
it('does not delete or audit a reclaimed identifier for a former owner', async () => {
  await db.insert(identifiers).values({
    name: RELEASE_NAME,
    status: 'claimed',
    ownerPubkey: NEW_OWNER
  });

  await expect(releaseOwnedIdentifier(OLD_OWNER)).resolves.toEqual({ ok: false, reason: 'not_found' });

  const [row] = await db.select().from(identifiers).where(eq(identifiers.name, RELEASE_NAME));
  expect(row.ownerPubkey).toBe(NEW_OWNER);
  expect(
    await db
      .select()
      .from(identifierEvents)
      .where(and(eq(identifierEvents.identifierName, RELEASE_NAME), eq(identifierEvents.actorPubkey, OLD_OWNER)))
  ).toHaveLength(0);
});

it('deletes an owned identifier and records one released event', async () => {
  await db.insert(identifiers).values({
    name: RELEASE_NAME,
    status: 'claimed',
    ownerPubkey: OLD_OWNER
  });

  await expect(releaseOwnedIdentifier(OLD_OWNER)).resolves.toEqual({ ok: true, name: RELEASE_NAME });
  expect(await db.select().from(identifiers).where(eq(identifiers.name, RELEASE_NAME))).toHaveLength(0);
  const events = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, RELEASE_NAME));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ eventType: 'released', actorPubkey: OLD_OWNER, reason: null });
});
```

The first test catches an ownerless delete or orphan audit. The second catches a split delete/audit workflow.

- [ ] **Step 6: Run the release service tests and verify RED**

Run:

```bash
set -a; source .env.example; set +a
pnpm vitest run src/lib/server/identifiers/account.test.ts -t "release|released event"
```

Expected: FAIL because `releaseOwnedIdentifier` is not exported.

- [ ] **Step 7: Implement conditional delete and audit in one transaction**

Add:

```ts
export type ReleaseOwnedIdentifierResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'not_found' };

export async function releaseOwnedIdentifier(ownerPubkey: string): Promise<ReleaseOwnedIdentifierResult> {
  const releasedName = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(identifiers)
      .where(and(eq(identifiers.ownerPubkey, ownerPubkey), eq(identifiers.status, 'claimed')))
      .returning({ name: identifiers.name });

    if (!deleted) return null;
    await tx.insert(identifierEvents).values({
      identifierName: deleted.name,
      eventType: 'released',
      actorPubkey: ownerPubkey,
      reason: null
    });
    return deleted.name;
  });

  if (releasedName === null) return { ok: false, reason: 'not_found' };
  await invalidateIdentifier(releasedName);
  return { ok: true, name: releasedName };
}
```

- [ ] **Step 8: Run all account service tests and verify GREEN**

Run:

```bash
set -a; source .env.example; set +a
pnpm vitest run src/lib/server/identifiers/account.test.ts
```

Expected: all account service tests pass with no warnings.

- [ ] **Step 9: Refactor both routes into thin adapters**

The relay route retains authentication and JSON shape parsing, then maps service results: invalid relay to 400 with its exact error, not found to 404, success to `{ relays }`. The release route retains authentication and maps service not found to 404 and success to `{ ok: true }`. Remove direct imports of `db`, Drizzle predicates, schema objects, and cache helpers from both route files.

Update route tests so they continue to cover 401, invalid request shape, exact relay validation error, 404, and success response shape. Persistence/audit/cache assertions move to `account.test.ts`. Add route-level reclaimed-owner cases against real Postgres so the complete HTTP boundary returns 404 without changing the new owner.

- [ ] **Step 10: Run focused service and route tests**

Run:

```bash
set -a; source .env.example; set +a
pnpm vitest run src/lib/server/identifiers/account.test.ts \
  src/routes/api/account/relays/server.test.ts \
  src/routes/api/account/release/server.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/lib/server/identifiers/account.ts \
  src/lib/server/identifiers/account.test.ts \
  src/routes/api/account/relays/+server.ts \
  src/routes/api/account/relays/server.test.ts \
  src/routes/api/account/release/+server.ts \
  src/routes/api/account/release/server.test.ts
git commit -m "fix: make account mutations owner-atomic"
```

---

### Task 2: Total request results and truthful relay feedback

**Files:**
- Modify: `src/lib/client/accountForm.ts`
- Modify: `src/lib/client/accountForm.test.ts`
- Modify: `src/routes/account/+page.svelte`
- Create: `src/routes/account/page.test.ts`

**Interfaces:**
- Consumes: existing `/api/account/relays` and `/api/account/release` response shapes.
- Produces: both request helpers always resolve to their existing discriminated result union, including rejected fetches.
- Produces: `parseRelayError(error: string): { index: number; message: string } | null`, where `index` is zero-based.
- Produces: mounted account-page behavior that clears saved/error state on every draft mutation and associates indexed errors with the correct row.

- [ ] **Step 1: Write failing helper tests for rejected and malformed responses**

Add tests that catch unhandled rejection and unsafe response assumptions:

```ts
it('returns a recoverable error when saving relays cannot reach the server', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network detail'))));
  await expect(saveRelays([])).resolves.toEqual({
    ok: false,
    error: 'Could not reach the server. Check your connection and try again.'
  });
});

it('returns a recoverable error when release cannot reach the server', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network detail'))));
  await expect(releaseIdentifier()).resolves.toEqual({
    ok: false,
    error: 'Could not reach the server. Check your connection and try again.'
  });
});

it('returns a safe error when a failed relay response is not JSON', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway failure', { status: 502 })));
  await expect(saveRelays([])).resolves.toEqual({
    ok: false,
    error: 'We could not save your relays. Please try again.'
  });
});
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `pnpm vitest run src/lib/client/accountForm.test.ts`.

Expected: rejected-fetch tests reject instead of resolving.

- [ ] **Step 3: Implement total helper results**

Wrap each fetch and response parse boundary. Use these exact user messages:

```ts
const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';
const SAVE_ERROR = 'We could not save your relays. Please try again.';
const RELEASE_ERROR = 'We could not release this identifier. Please try again.';
```

On fetch rejection return `NETWORK_ERROR`. On a non-success response with no string `body.error`, return the operation-specific error. On a 200 relay response, require `body.relays` to be an array of strings; otherwise return `SAVE_ERROR`. Never return raw exception text.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `pnpm vitest run src/lib/client/accountForm.test.ts`.

Expected: all helper tests pass.

- [ ] **Step 5: Write failing indexed-error parser tests**

```ts
it('maps a one-based relay validation error to a zero-based row', () => {
  expect(parseRelayError('relay 2: must start with wss://')).toEqual({
    index: 1,
    message: 'must start with wss://'
  });
});

it('leaves non-indexed errors at section level', () => {
  expect(parseRelayError('Could not reach the server. Check your connection and try again.')).toBeNull();
});
```

Expected RED: `parseRelayError` is not exported. Implement it with `/^relay (\d+):\s*(.+)$/i`, reject indexes below one and empty messages, then verify GREEN.

- [ ] **Step 6: Create a mounted real-component test harness and verify RED**

Create `src/routes/account/page.test.ts` with `// @vitest-environment happy-dom`, mock `$app/navigation`, and mount the real page with Svelte's `mount`/`unmount`. Use literal account data and clean `document.body`, globals, and mounted components after every test.

Add these tests:

1. Successful save followed by Add relay removes the visible `Saved` confirmation.
2. A rejected save re-enables Save and shows `NETWORK_ERROR` rather than leaving `Saving…`.
3. A 400 `relay 1: not a valid URL` response marks Relay 1 `aria-invalid="true"`, sets `aria-describedby` to the adjacent error element, and renders `not a valid URL` there.
4. Editing, adding, or removing a row clears the previous row error and saved state.

The test must interact through labels and buttons on the mounted component, not call internal component functions.

Run: `pnpm vitest run src/routes/account/page.test.ts`.

Expected: at least tests 1–3 fail against the current page.

- [ ] **Step 7: Implement minimal relay draft and error state changes**

In `+page.svelte`:

- Remove the obsolete `svelte-ignore` comment.
- Add `relayErrorIndex: number | null` and `relayErrorMessage` state.
- Add one `markRelaysDirty()` function that resets `saveStatus`, section error, and indexed error state; call it from add, edit, and remove.
- In `save()`, use `try/finally` so a non-success path cannot leave `saveStatus === 'saving'`; only retain `saved` after success.
- Parse failures with `parseRelayError`. Indexed errors render immediately after their row with stable id `relay-${index}-error`; inputs receive `aria-invalid` and `aria-describedby`. Other errors remain in the section alert.
- Preserve server-normalized relays on success.
- Add calm section guidance: `Public · wss:// only · {relays.length} of 8`.

- [ ] **Step 8: Run mounted component and helper tests and verify GREEN**

Run:

```bash
pnpm vitest run src/lib/client/accountForm.test.ts src/routes/account/page.test.ts
```

Expected: all tests pass with no unhandled rejections.

- [ ] **Step 9: Commit**

```bash
git add src/lib/client/accountForm.ts src/lib/client/accountForm.test.ts \
  src/routes/account/+page.svelte src/routes/account/page.test.ts
git commit -m "fix: harden account relay feedback"
```

---

### Task 3: Accessible release dialog and accurate inactivity evidence

**Files:**
- Modify: `src/routes/account/+page.svelte`
- Modify: `src/routes/account/page.test.ts`

**Interfaces:**
- Consumes: `releaseIdentifier()` total result from Task 2 and existing `goto('/claim')` success navigation.
- Produces: a no-outside-click dialog that initially focuses Cancel, traps Tab/Shift+Tab, handles idle Escape, and restores focus to the launcher after dismissal.
- Produces: `Last NIP-05 lookup` evidence with a concise explanation of lookup-driven eligibility.

- [ ] **Step 1: Write failing mounted-component dialog tests**

Add real interaction tests:

1. Focus the Release launcher, open the dialog, await `tick()`, and assert Cancel owns focus.
2. From Cancel, pressing Tab focuses the affirmative release button; pressing Tab again wraps to Cancel; Shift+Tab from Cancel wraps to the affirmative button.
3. Pressing Escape while idle closes the dialog and restores focus to the Release launcher.
4. Clicking the backdrop does not close the dialog.
5. A rejected release request keeps the dialog open, restores `Release <name>` rather than `Releasing…`, announces `NETWORK_ERROR`, and leaves focus inside the dialog.

Run: `pnpm vitest run src/routes/account/page.test.ts -t "dialog|release request"`.

Expected: focus, Escape, wrapping, and rejected-request tests fail against the current component.

- [ ] **Step 2: Implement the complete dialog focus lifecycle**

Use bound references for launcher, affirmative action, and Cancel. On open, remember the launcher and focus Cancel after the DOM updates. Handle `keydown` only while the modal is open:

- Escape while idle prevents default, closes, clears release error/status, and restores launcher focus after the DOM updates.
- Escape while releasing does nothing.
- Tab cycles only between Cancel and the affirmative action, respecting Shift.
- Cancel follows the same close-and-restore path.
- A failed request resets `releaseStatus` in `finally`, keeps the modal open, and focuses the affirmative action or Cancel.

Do not add outside-click closing or a dependency. Keep `role="dialog"`, `aria-modal`, title, description, and alert semantics.

- [ ] **Step 3: Verify dialog tests GREEN**

Run the Step 1 command. Expected: all focused dialog tests pass.

- [ ] **Step 4: Write and verify the inactivity-copy component test**

Add a test asserting the real mounted page exposes:

- `Last NIP-05 lookup`.
- `Public lookups keep this identifier active.`
- The existing `Eligible for release after` evidence line.

Expected RED: current page says `Last verified`. Update the component with the exact copy while preserving the calm evidence layout, then rerun for GREEN.

- [ ] **Step 5: Apply the Impeccable production-quality floor**

Run the Impeccable detector against `src/routes/account/+page.svelte`. Verify the row-level error, helper copy, focus ring, small-screen stacking, and local control targets remain consistent with `DESIGN.md`. Fix detector findings in one bounded batch; do not redesign the surface.

- [ ] **Step 6: Run all account UI tests**

Run:

```bash
pnpm vitest run src/lib/client/accountForm.test.ts src/routes/account/page.test.ts
pnpm check
pnpm lint
```

Expected: all tests and static checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/account/+page.svelte src/routes/account/page.test.ts
git commit -m "fix: complete account dialog accessibility"
```

---

### Task 4: Reconcile Account and Admin contracts

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `docs/superpowers/specs/2026-08-27-account-management-design.md`
- Modify: `docs/superpowers/specs/2026-08-27-admin-dashboard-design.md`
- Modify: `docs/superpowers/plans/2026-08-27-account-management.md`
- Modify: `docs/superpowers/plans/2026-08-27-admin-dashboard.md`

**Interfaces:**
- Consumes: the implemented account service/result types and the stabilization spec.
- Produces: one consistent contract for live Admin staleness, calendar-month eligibility, atomic destructive writes, SvelteKit-safe test filenames, canonical design tokens, and final verification.

- [ ] **Step 1: Update the source product spec**

Replace the daily scheduled-job requirement in Identifier lifecycle with a live Admin query. State that no background scan exists because there is no warning channel, materialized report, or automatic deletion. Require both the report and force-release mutation to use the same PostgreSQL condition:

```sql
last_identified_at < now() - interval '6 months'
```

Retain manual review, required force-release reason, atomic delete/audit, and fail-open post-commit invalidation.

- [ ] **Step 2: Correct the Account Management design and plan**

Replace preliminary owner lookup plus name-only mutation examples with `saveOwnedRelays()` and `releaseOwnedIdentifier()` calls. Document owner/status predicates, `DELETE ... RETURNING`, same-transaction release audit, indexed row errors, total request results, full dialog focus lifecycle, and `Last NIP-05 lookup` language.

Update route-test names and commands to `server.test.ts`/`page.server.test.ts`. Do not rewrite completed-history checkboxes or claim the original implementation was race-safe.

- [ ] **Step 3: Correct the Admin Dashboard design**

Specify:

- One shared calendar-month SQL eligibility condition for report and force release.
- Live-query behavior with no scheduled job.
- Same-transaction reservation delete/audit and force-release delete/audit.
- Canonical lavender/plum/paper tokens from `DESIGN.md`, system-sans operational text, and no undefined navy/cream/oxblood tokens.
- Hard-interrupt dialog focus lifecycle matching the stabilized Account dialog.

- [ ] **Step 4: Correct the Admin Dashboard implementation plan**

Add a status note that Tasks 1–4 are already complete at commit `3f34d20` and must not be repeated. Correct the remaining tasks as follows:

- Replace every route test filename beginning with `+` by `server.test.ts` or `page.server.test.ts`, including all file lists and commands.
- Replace both `STALE_AFTER_MS = 6 * 30 * 24 * 60 * 60 * 1000` implementations with a shared `staleIdentifierCondition()` in `src/lib/server/identifiers/adminQueries.ts` that returns Drizzle SQL for `last_identified_at < now() - interval '6 months'`.
- Require report and force-release code to import that same condition.
- Put reservation deletion plus `reservation_removed` insertion in one transaction.
- Put force-release conditional deletion plus `force_released` insertion in one transaction; return 409 and write no event when no eligible row is returned.
- Replace `--color-void` with `--color-line`, `--color-oxblood` with `--color-accent-rose-text`, and whole-table `--font-mono` with `--font-ui`.
- Add initial focus, Tab containment, idle Escape, and focus restoration to both destructive Admin dialogs.
- Add `pnpm format:check` and `pnpm build` to final verification. Do not hard-code an e2e test count; require zero failures from the discovered suite.

- [ ] **Step 5: Self-review the reconciled documents**

Run:

```bash
rg -n "6 \* 30|STALE_AFTER_MS|\+server\.test|\+page\.server\.test|color-void|color-oxblood|font-mono" \
  docs/SPEC.md \
  docs/superpowers/specs/2026-08-27-account-management-design.md \
  docs/superpowers/specs/2026-08-27-admin-dashboard-design.md \
  docs/superpowers/plans/2026-08-27-account-management.md \
  docs/superpowers/plans/2026-08-27-admin-dashboard.md
```

Expected: no obsolete implementation instructions. A historical explanation may mention a rejected value only when clearly labeled as rejected and not presented in a code block.

Then verify every account API example delegates to `src/lib/server/**`, every destructive delete is paired with audit insertion in the same transaction, and the Admin plan begins remaining execution at Task 5.

- [ ] **Step 6: Commit**

```bash
git add docs/SPEC.md \
  docs/superpowers/specs/2026-08-27-account-management-design.md \
  docs/superpowers/specs/2026-08-27-admin-dashboard-design.md \
  docs/superpowers/plans/2026-08-27-account-management.md \
  docs/superpowers/plans/2026-08-27-admin-dashboard.md
git commit -m "docs: reconcile account and admin contracts"
```

---

### Task 5: Formatting baseline and complete verification

**Files:**
- Modify: `.prettierignore`
- Modify mechanically: files reported by `pnpm format:check`, excluding ignored generated/documentation paths

**Interfaces:**
- Consumes: all stabilization changes from Tasks 1–4.
- Produces: clean formatting, lint, type/Svelte, coverage, build, and available e2e gates without semantic source changes.

- [ ] **Step 1: Isolate generated Impeccable artifacts from source formatting**

Append this exact entry to `.prettierignore`:

```text
.impeccable/
```

Do not stage or commit `.impeccable/critique/`.

- [ ] **Step 2: Reproduce the formatting baseline**

Run: `pnpm format:check`.

Expected before formatting: FAIL listing the remaining non-ignored source/config files.

- [ ] **Step 3: Apply only mechanical Prettier formatting**

Run: `pnpm format`.

Inspect `git diff --stat`, `git diff --check`, and the full diff. Revert any semantic change; Prettier output must be formatting-only. Preserve unrelated user changes.

- [ ] **Step 4: Verify formatting and lint**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
```

Expected: all commands exit 0 with no errors or warnings.

- [ ] **Step 5: Run the complete unit/integration coverage suite**

Run:

```bash
set -a; source .env.example; set +a
pnpm test:coverage
```

Expected: all discovered tests pass and line, function, branch, and statement coverage remain at or above 90%.

- [ ] **Step 6: Run the production build**

Run:

```bash
set -a; source .env.example; set +a
pnpm build
```

Expected: exit 0.

- [ ] **Step 7: Run Account Management Playwright coverage when available**

Run:

```bash
set -a; source .env.example; set +a
pnpm test:e2e -- --grep "account"
```

Expected: all selected account tests pass. If the installed browser cannot launch because system libraries are absent, capture the exact missing-library error in the task report; do not install host packages or substitute another gate.

- [ ] **Step 8: Commit formatting-only changes**

```bash
git add .prettierignore
git add -u
git diff --cached --check
git commit -m "style: restore formatting baseline"
```

Confirm `.impeccable/critique/` remains untracked and unstaged.

- [ ] **Step 9: Final independent review package**

Generate a review package from the branch merge base through `HEAD`. The reviewer must check every stabilization-spec requirement, both ownership invariants, transaction boundaries, test isolation, UI keyboard behavior, documentation consistency, and that no Admin task 5–12 implementation slipped into scope.

No Admin Dashboard feature execution begins until all critical and important review findings are resolved or explicitly surfaced after the review process cap.
