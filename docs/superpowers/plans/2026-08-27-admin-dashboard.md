# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** The Foundation, Auth, Claim-flow, and Account-management plans must be implemented first. This plan builds on and amends Claim flow's `reservedPatterns.ts`, and reuses `CredentialCard.svelte`/design tokens and `invalidateIdentifier`. "Modify" steps show full resulting files rather than line ranges where the target file doesn't exist yet at time of writing.

**Goal:** Add the admin report page — a live staleness report with force-release, and reservation management — completing the write surfaces `docs/SPEC.md`'s Roles section describes.

**Architecture:** An `isAdmin` guard (config-based allowlist, injectable for testing) sits in front of one page (`/admin`) and three thin routes, mirroring every prior sub-project's layering. The report data comes from two small, independently testable query functions rather than inline route logic.

**Tech Stack:** SvelteKit 2, Drizzle ORM, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-admin-dashboard-design.md` (and `docs/SPEC.md`, `PRODUCT.md` for full context)

> **Execution status (2026-08-27):** Tasks 1–4 were completed at commit `3f34d20`. Their checklists below are preserved as implementation history and must not be repeated. Remaining execution begins at Task 5.

### Remaining-work environment preflight

Before Task 5, restore the ignored worktree-local environment and services that Task 1's historical instructions assumed:

```bash
test -f .env || cp .env.example .env
docker compose up -d
pnpm db:migrate
```

`.env.example` already contains the fixed Admin e2e pubkey. Keep the resulting `.env` untracked. Vite/Vitest commands below load it automatically. For Playwright preview runs, override the public origin explicitly with `PUBLIC_ORIGIN=http://localhost:4173`; the normal development value in `.env.example` is port 5173.

## Global Constraints

- Privileged logic only in `src/lib/server/**`, relative imports inside it — same as every prior sub-project.
- Admin is config-membership (`ADMIN_PUBKEYS`), not a DB role column. `isAdmin(pubkey, admins?)` takes an injectable list (defaulting to real config) so both branches are testable deterministically, same pattern as Account management's `validateRelayList`.
- `/admin`: unauthenticated → redirect `/login`; authenticated non-admin → `403` (not a disguising redirect).
- Staleness report is a **live query** — no background job dependency.
- Reservation creation validates format only (`isValidNameFormat`, not the reserved-pattern blocklist).
- Report and force-release import the same `staleIdentifierCondition()` from `src/lib/server/identifiers/adminQueries.ts`; it returns Drizzle SQL for `last_identified_at + interval '6 months' < now()`, including PostgreSQL month-end clamping (August 31 + six months = February 28).
- Force-release re-verifies that shared condition server-side inside the same delete, never trusting the report snapshot the admin is looking at.
- Force-release and reservation creation trim their required reasons server-side, reject empty-after-trim values, and persist the trimmed reason. Reservation removal does not require one.
- Admin-facing conflict/error messages may be specific (unlike the public-facing endpoints) — the admin already sees the full picture in the report.
- `identifierEventType` gains `'reserved'` and `'reservation_removed'` — one new migration, nothing else about the schema changes.
- **Fixed test keypair for admin e2e**: secret key = 32 bytes of `0xaa`; its derived pubkey is `0000000000000000000000000000000000000000000000000000000000000000`. This exact pubkey goes into `.env.example`'s `ADMIN_PUBKEYS` (Task 1) — every other e2e test uses a fresh random keypair per run, but this one can't, since its pubkey must exist in config before the server starts.
- `.svelte` files stay excluded from the coverage threshold; verified by Playwright instead. 90% coverage gate applies to everything else.
- Every real-database test file owns distinct seed-audited claimed-owner pubkeys. Live-report assertions filter to that suite's fixture names instead of expecting the entire shared database result.
- All three browser write helpers are typed and total; mounted tests cover rejection, malformed responses, pending/double-submit guards, and finalizer recovery.

---

## File Structure

```
src/lib/server/
  config.ts (modify)                — add ADMIN_PUBKEYS
  config.test.ts (modify)
  auth/
    admin.ts, admin.test.ts          — isAdmin()
  db/
    schema.ts (modify)               — extend identifierEventType
    schema.test.ts (modify)
  identifiers/
    reservedPatterns.ts (modify)     — split into isValidNameFormat + isClaimableName
    reservedPatterns.test.ts (modify)
    adminQueries.ts, adminQueries.test.ts  — getStaleIdentifiers(), getReservations()
    adminReservations.ts, adminReservations.test.ts — reservation mutations and audit
    adminForceRelease.ts, adminForceRelease.test.ts — conditional force-release and audit

src/lib/client/
  adminForm.ts, adminForm.test.ts     — total typed Admin write helpers

src/routes/api/admin/
  reservations/+server.ts, server.test.ts             — POST
  reservations/[name]/+server.ts, server.test.ts       — DELETE
  force-release/+server.ts, server.test.ts             — POST

src/routes/admin/
  +page.server.ts, page.server.test.ts
  +page.svelte, page.test.ts

.env.example (modify)
tests/e2e/helpers/fixedAdminSigner.ts
tests/e2e/admin-dashboard.spec.ts
README.md (modify)
```

---

### Task 1: Config — `ADMIN_PUBKEYS`

**Files:**
- Modify: `src/lib/server/config.ts`
- Modify: `src/lib/server/config.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing new
- Produces: `config.ADMIN_PUBKEYS: string[]` (lowercased hex, default `[]`), added to `Config`

- [ ] **Step 1: Write the failing tests (append to `config.test.ts`)**

```ts
it('defaults ADMIN_PUBKEYS to an empty array when unset', async () => {
  Object.assign(process.env, REQUIRED_ENV);
  delete process.env.ADMIN_PUBKEYS;
  const { config } = await import('./config?t=' + Date.now());
  expect(config.ADMIN_PUBKEYS).toEqual([]);
});

it('parses and lowercases ADMIN_PUBKEYS from env', async () => {
  Object.assign(process.env, REQUIRED_ENV, {
    ADMIN_PUBKEYS: '6A04AB98D9E4774AD806E302DDDEB63BEA16B5CB5F223EE77478E861BB583EB3'
  });
  const { config } = await import('./config?t=' + Date.now());
  expect(config.ADMIN_PUBKEYS).toEqual(['0000000000000000000000000000000000000000000000000000000000000000']);
});

it('throws when an ADMIN_PUBKEYS entry is not valid hex', async () => {
  Object.assign(process.env, REQUIRED_ENV, { ADMIN_PUBKEYS: 'not-hex' });
  await expect(import('./config?t=' + Date.now())).rejects.toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/config.test.ts`
Expected: FAIL — `config.ADMIN_PUBKEYS` is `undefined`.

- [ ] **Step 3: Write the full updated `config.ts`**

```ts
// src/lib/server/config.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  VALKEY_URL: z.string().url(),
  PUBLIC_ORIGIN: z.string().url(),
  DEFAULT_RELAYS: z
    .string()
    .default('')
    .transform((val) => (val.trim().length === 0 ? [] : val.split(',').map((s) => s.trim())))
    .pipe(z.array(z.string().url())),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ADMIN_PUBKEYS: z
    .string()
    .default('')
    .transform((val) => (val.trim().length === 0 ? [] : val.split(',').map((s) => s.trim().toLowerCase())))
    .pipe(z.array(z.string().regex(/^[0-9a-f]{64}$/)))
});

export type Config = z.infer<typeof envSchema>;
export const config: Config = envSchema.parse(process.env);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/config.test.ts`
Expected: PASS (9 tests — the prior 6 plus these 3)

- [ ] **Step 5: Update `.env.example` and your local `.env`**

Append to `.env.example`:

```
ADMIN_PUBKEYS=0000000000000000000000000000000000000000000000000000000000000000
```

Add the same line to your local `.env` — every route test from Task 6 onward relies on this pubkey being a configured admin.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/config.ts src/lib/server/config.test.ts .env.example
git commit -m "feat: add ADMIN_PUBKEYS config"
```

---

### Task 2: `isAdmin`

**Files:**
- Create: `src/lib/server/auth/admin.ts`
- Test: `src/lib/server/auth/admin.test.ts`

**Interfaces:**
- Consumes: `config.ADMIN_PUBKEYS` from Task 1 (`../config`)
- Produces: `isAdmin(pubkey: string, admins?: string[]): boolean` from `src/lib/server/auth/admin.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/server/auth/admin.test.ts
import { describe, expect, it } from 'vitest';
import { isAdmin } from './admin';

describe('isAdmin', () => {
  it('returns true for a pubkey in the given admin list', () => {
    expect(isAdmin('a'.repeat(64), ['a'.repeat(64)])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAdmin('A'.repeat(64), ['a'.repeat(64)])).toBe(true);
  });

  it('returns false for a pubkey not in the list', () => {
    expect(isAdmin('b'.repeat(64), ['a'.repeat(64)])).toBe(false);
  });

  it('defaults to the real ADMIN_PUBKEYS config when no list is given', () => {
    expect(isAdmin('definitely-not-configured')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/auth/admin.test.ts`
Expected: FAIL — `./admin` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/server/auth/admin.ts
import { config } from '../config';

export function isAdmin(pubkey: string, admins: string[] = config.ADMIN_PUBKEYS): boolean {
  return admins.includes(pubkey.toLowerCase());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/auth/admin.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/auth/admin.ts src/lib/server/auth/admin.test.ts
git commit -m "feat: add isAdmin guard"
```

---

### Task 3: Schema — reservation event types

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Modify: `src/lib/server/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `identifierEventType` accepts `'reserved'` and `'reservation_removed'` in addition to the existing three values

- [ ] **Step 1: Write the failing test (append to `schema.test.ts`)**

```ts
describe('identifier_events with reservation event types', () => {
  const NAME = 'reservation-event-test';

  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, NAME));
  });

  it('accepts reserved and reservation_removed event types', async () => {
    await db.insert(identifierEvents).values({
      identifierName: NAME,
      eventType: 'reserved',
      actorPubkey: 'a'.repeat(64),
      reason: 'trademark hold'
    });
    const [row] = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, NAME));
    expect(row.eventType).toBe('reserved');
    expect(row.reason).toBe('trademark hold');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/server/db/schema.test.ts`
Expected: FAIL — the database rejects `'reserved'` as an invalid enum value.

- [ ] **Step 3: Update the enum in `schema.ts`**

```ts
export const identifierEventType = pgEnum('identifier_event_type', [
  'claimed',
  'released',
  'force_released',
  'reserved',
  'reservation_removed'
]);
```

(The rest of `schema.ts` is unchanged.)

- [ ] **Step 4: Generate and run the migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: a new `drizzle/0002_*.sql` is created and applied with no errors. If Postgres rejects adding an enum value and using it within the same transaction (a known Postgres restriction on `ALTER TYPE ... ADD VALUE`), split the generated migration into two files — one that adds the values, one that's empty/no-op — so the ALTER commits before anything references the new values; drizzle-kit's default output runs each migration file in its own transaction, so this is only needed if the generated single file mixes both in one statement batch.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/server/db/schema.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/db/schema.test.ts drizzle/
git commit -m "feat: add reserved/reservation_removed event types"
```

---

### Task 4: Split `isClaimableName`

**Files:**
- Modify: `src/lib/server/identifiers/reservedPatterns.ts`
- Modify: `src/lib/server/identifiers/reservedPatterns.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `isValidNameFormat(name: string): boolean` (new export); `isClaimableName(name: string): boolean` (unchanged behavior, now composed from `isValidNameFormat` plus the blocklist checks)

- [ ] **Step 1: Write the failing tests (add this describe block; leave the existing `isClaimableName` describe block exactly as it is)**

```ts
describe('isValidNameFormat', () => {
  it('accepts a normal lowercase name', () => {
    expect(isValidNameFormat('alice')).toBe(true);
  });

  it('accepts a reserved word — format alone does not block it', () => {
    expect(isValidNameFormat('admin')).toBe(true);
  });

  it('rejects names shorter than 2 or longer than 30 characters', () => {
    expect(isValidNameFormat('a')).toBe(false);
    expect(isValidNameFormat('a'.repeat(31))).toBe(false);
    expect(isValidNameFormat('a'.repeat(30))).toBe(true);
  });

  it('rejects uppercase and disallowed characters', () => {
    expect(isValidNameFormat('Alice')).toBe(false);
    expect(isValidNameFormat('alice smith')).toBe(false);
  });

  it('rejects leading/trailing separators and consecutive dots', () => {
    expect(isValidNameFormat('.alice')).toBe(false);
    expect(isValidNameFormat('alice.')).toBe(false);
    expect(isValidNameFormat('al..ice')).toBe(false);
  });
});
```

Also add `isValidNameFormat` to the existing `import { isClaimableName } from './reservedPatterns';` line, making it `import { isClaimableName, isValidNameFormat } from './reservedPatterns';`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm vitest run src/lib/server/identifiers/reservedPatterns.test.ts`
Expected: FAIL — `isValidNameFormat` is not exported. The existing `isClaimableName` tests still pass (nothing about them has changed yet).

- [ ] **Step 3: Write the full updated `reservedPatterns.ts`**

```ts
// src/lib/server/identifiers/reservedPatterns.ts
const RESERVED_EXACT = new Set([
  // platform protection
  'admin', 'support', 'help', 'contact', 'security', 'abuse', 'phostrich', 'www', 'api', 'root',
  'moderator', 'mod', 'staff', 'official', 'noreply', 'postmaster', 'webmaster', 'sysadmin',
  // generic / impersonation-prone
  'info', 'news', 'test', 'null', 'undefined', 'anonymous', 'everyone', 'nobody', 'system', 'service', 'bot',
  // government, prominent
  'whitehouse', 'fbi', 'cia', 'nsa', 'potus', 'congress', 'senate', 'un', 'nato', 'treasury', 'irs', 'pentagon',
  // major companies, likely-impersonated
  'google', 'apple', 'microsoft', 'amazon', 'meta', 'facebook', 'twitter', 'x', 'tesla', 'openai',
  'anthropic', 'binance', 'coinbase', 'kraken'
]);

// This set is a curated starting point, not a claim of exhaustiveness - extend it
// via ordinary code review as squatting/impersonation attempts surface.
const RESERVED_PATTERNS = [/(^|[._-])gov([._-]|$)/i];

const NAME_FORMAT = /^[a-z0-9._-]+$/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 30;

export function isValidNameFormat(name: string): boolean {
  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) return false;
  if (!NAME_FORMAT.test(name)) return false;
  if (name.startsWith('.') || name.endsWith('.')) return false;
  if (name.startsWith('-') || name.endsWith('-')) return false;
  if (name.startsWith('_') || name.endsWith('_')) return false;
  if (name.includes('..')) return false;
  return true;
}

export function isClaimableName(name: string): boolean {
  if (!isValidNameFormat(name)) return false;
  if (RESERVED_EXACT.has(name)) return false;
  if (RESERVED_PATTERNS.some((pattern) => pattern.test(name))) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/identifiers/reservedPatterns.test.ts`
Expected: PASS (11 tests — the existing 6 plus these 5)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/identifiers/reservedPatterns.ts src/lib/server/identifiers/reservedPatterns.test.ts
git commit -m "refactor: split isClaimableName into isValidNameFormat plus blocklist"
```

---

### Task 5: Admin report queries

**Files:**
- Create: `src/lib/server/identifiers/adminQueries.ts`
- Test: `src/lib/server/identifiers/adminQueries.test.ts`

**Interfaces:**
- Consumes: `db`, `identifiers`, `identifierEvents` (`../db`, `../db/schema`)
- Produces: `staleIdentifierCondition(referenceTime: Date | SQL = sql\`now()\`)` (the single PostgreSQL addition condition) and `getStaleIdentifiers(referenceTime?: Date | SQL)`, so fixed-reference tests and production's default `now()` share one implementation.

Tests use fixed references, never `Date.now()`: with `last_identified_at = '2026-08-31T00:00:00Z'`, it is excluded just before and at exact eligibility, then included just after (`<` is strict); repeat Aug 31 → Feb 29 for the 2028 leap year. Both report and force release use the default `now()` helper in production.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/server/identifiers/adminQueries.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { getReservations, getStaleIdentifiers } from './adminQueries';

const STALE_NAME = 'admin-query-stale-test';
const FRESH_NAME = 'admin-query-fresh-test';
const RESERVED_NAME = 'admin-query-reserved-test';
// Seed-audited for this suite; no other integration file may reuse these owners.
const STALE_OWNER = '5101000000000000000000000000000000000000000000000000000000000000';
const FRESH_OWNER = '5102000000000000000000000000000000000000000000000000000000000000';

describe('getStaleIdentifiers', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, STALE_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, FRESH_NAME));
  });

  it('uses strict fixed-reference addition boundaries, including month-end and leap-year clamping', async () => {
    const august31 = new Date('2026-08-31T00:00:00.000Z');
    const leapAugust31 = new Date('2027-08-31T00:00:00.000Z');

    await db.insert(identifiers).values({
      name: STALE_NAME,
      status: 'claimed',
      ownerPubkey: STALE_OWNER,
      lastIdentifiedAt: august31
    });
    await db.insert(identifiers).values({
      name: FRESH_NAME,
      status: 'claimed',
      ownerPubkey: FRESH_OWNER,
      lastIdentifiedAt: leapAugust31
    });

    const ownedNamesAt = async (referenceTime: Date) =>
      (await getStaleIdentifiers(referenceTime))
        .map((row) => row.name)
        .filter((name) => name === STALE_NAME || name === FRESH_NAME);

    expect(await ownedNamesAt(new Date('2027-02-27T23:59:59.999Z'))).toEqual([]);
    expect(await ownedNamesAt(new Date('2027-02-28T00:00:00.000Z'))).toEqual([]);
    expect(await ownedNamesAt(new Date('2027-02-28T00:00:00.001Z'))).toEqual([STALE_NAME]);
    expect(await ownedNamesAt(new Date('2028-02-29T00:00:00.000Z'))).toEqual([STALE_NAME]);
    expect(await ownedNamesAt(new Date('2028-02-29T00:00:00.001Z'))).toEqual([
      STALE_NAME,
      FRESH_NAME
    ]);
  });
});

describe('getReservations', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, RESERVED_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, RESERVED_NAME));
  });

  it('returns reserved identifiers with their reason and actor', async () => {
    await db.insert(identifiers).values({ name: RESERVED_NAME, status: 'reserved', ownerPubkey: null });
    await db.insert(identifierEvents).values({
      identifierName: RESERVED_NAME,
      eventType: 'reserved',
      actorPubkey: 'c'.repeat(64),
      reason: 'trademark hold'
    });

    const result = await getReservations();
    const row = result.find((r) => r.name === RESERVED_NAME);
    expect(row).toBeDefined();
    expect(row?.reason).toBe('trademark hold');
    expect(row?.actorPubkey).toBe('c'.repeat(64));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/identifiers/adminQueries.test.ts`
Expected: FAIL — `./adminQueries` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/server/identifiers/adminQueries.ts
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';

export function staleIdentifierCondition(referenceTime: Date | SQL = sql`now()`) {
  return sql`${identifiers.lastIdentifiedAt} + interval '6 months' < ${referenceTime}`;
}

export interface StaleIdentifier {
  name: string;
  ownerPubkey: string | null;
  lastIdentifiedAt: Date;
}

export interface Reservation {
  name: string;
  createdAt: Date;
  reason: string | null;
  actorPubkey: string | null;
}

export async function getStaleIdentifiers(referenceTime: Date | SQL = sql`now()`): Promise<StaleIdentifier[]> {
  return db
    .select({
      name: identifiers.name,
      ownerPubkey: identifiers.ownerPubkey,
      lastIdentifiedAt: identifiers.lastIdentifiedAt
    })
    .from(identifiers)
    .where(and(eq(identifiers.status, 'claimed'), staleIdentifierCondition(referenceTime)))
    .orderBy(asc(identifiers.lastIdentifiedAt));
}

export async function getReservations(): Promise<Reservation[]> {
  const rows = await db
    .select({ name: identifiers.name, createdAt: identifiers.createdAt })
    .from(identifiers)
    .where(eq(identifiers.status, 'reserved'))
    .orderBy(asc(identifiers.name));

  // N+1 by design: reservation counts are expected to be small for v1, and this
  // keeps the "latest reserved event per name" lookup simple rather than a window-function query.
  return Promise.all(
    rows.map(async (row) => {
      const [event] = await db
        .select({ reason: identifierEvents.reason, actorPubkey: identifierEvents.actorPubkey })
        .from(identifierEvents)
        .where(and(eq(identifierEvents.identifierName, row.name), eq(identifierEvents.eventType, 'reserved')))
        .orderBy(desc(identifierEvents.createdAt))
        .limit(1);
      return { ...row, reason: event?.reason ?? null, actorPubkey: event?.actorPubkey ?? null };
    })
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/identifiers/adminQueries.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/identifiers/adminQueries.ts src/lib/server/identifiers/adminQueries.test.ts
git commit -m "feat: add admin report queries"
```

---

### Task 6: `POST /api/admin/reservations`

**Files:**
- Create: `src/lib/server/identifiers/adminReservations.ts`
- Test: `src/lib/server/identifiers/adminReservations.test.ts`
- Create: `src/routes/api/admin/reservations/+server.ts`
- Test: `src/routes/api/admin/reservations/server.test.ts`

**Interfaces:**
- Service consumes: `isValidNameFormat` from Task 4, `db`, `identifiers`, and `identifierEvents` through relative server-only imports.
- Produces: `createAdminReservation(actorPubkey, rawName, rawReason): Promise<CreateAdminReservationResult>`. It normalizes the name, trims the reason, owns validation/transaction/conflict lookup, and returns a discriminated domain result.
- Route consumes: `isAdmin` and `createAdminReservation`; it only authenticates, parses string shapes, calls the service, and maps the result.
- Produces: `POST: RequestHandler` — `{name, reason, actorPubkey, createdAt}` on 201 so the live table can render complete audit metadata without a reload; 400 (invalid name / blank reason), 401 unauthenticated, 403 non-admin, 409 (`name_claimed` or `name_already_reserved`).

- [ ] **Step 1: Write failing service tests for validation, normalization, persistence, and audit**

Create `adminReservations.test.ts` with suite-owned fixture names and owner values. It asserts real Postgres behavior:

```ts
// src/lib/server/identifiers/adminReservations.test.ts (Task 6 result)
import { afterEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { createAdminReservation } from './adminReservations';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const CREATE_NAME = 'admin-service-reservation-create';
const CLAIMED_NAME = 'admin-service-reservation-claimed';
const CLAIMED_OWNER = '5201000000000000000000000000000000000000000000000000000000000000';
const FIXTURE_NAMES = [CREATE_NAME, CLAIMED_NAME];

describe('admin reservation service', () => {
  afterEach(async () => {
    await db
      .delete(identifierEvents)
      .where(inArray(identifierEvents.identifierName, FIXTURE_NAMES));
    await db.delete(identifiers).where(inArray(identifiers.name, FIXTURE_NAMES));
  });

  it('rejects a whitespace-only reservation reason without writing rows', async () => {
    await expect(createAdminReservation(ADMIN_PUBKEY, CREATE_NAME, '   ')).resolves.toEqual({
      ok: false,
      reason: 'reason_required'
    });
    expect(
      await db.select().from(identifiers).where(eq(identifiers.name, CREATE_NAME))
    ).toHaveLength(0);
  });

  it('persists the trimmed reservation reason in the same transaction as the row', async () => {
    await expect(
      createAdminReservation(ADMIN_PUBKEY, CREATE_NAME.toUpperCase(), '  trademark hold  ')
    ).resolves.toEqual({
      ok: true,
      name: CREATE_NAME,
      reason: 'trademark hold',
      actorPubkey: ADMIN_PUBKEY,
      createdAt: expect.any(Date)
    });

    const [event] = await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, CREATE_NAME));
    expect(event).toMatchObject({
      eventType: 'reserved',
      actorPubkey: ADMIN_PUBKEY,
      reason: 'trademark hold'
    });
  });

  it('rejects an invalid identifier name', async () => {
    await expect(createAdminReservation(ADMIN_PUBKEY, 'bad name', 'reason')).resolves.toEqual({
      ok: false,
      reason: 'invalid_name'
    });
  });

  it('reports claimed and reserved conflicts distinctly', async () => {
    await db.insert(identifiers).values({
      name: CLAIMED_NAME,
      status: 'claimed',
      ownerPubkey: CLAIMED_OWNER
    });
    await db.insert(identifiers).values({
      name: CREATE_NAME,
      status: 'reserved',
      ownerPubkey: null
    });

    await expect(
      createAdminReservation(ADMIN_PUBKEY, CLAIMED_NAME, 'reason')
    ).resolves.toEqual({ ok: false, reason: 'name_claimed' });
    await expect(
      createAdminReservation(ADMIN_PUBKEY, CREATE_NAME, 'reason')
    ).resolves.toEqual({ ok: false, reason: 'name_already_reserved' });
  });
});
```

- [ ] **Step 2: Run the service tests and verify RED**

Run: `pnpm vitest run src/lib/server/identifiers/adminReservations.test.ts`

Expected: FAIL — `adminReservations.ts` does not exist.

- [ ] **Step 3: Implement the focused reservation service**

```ts
// src/lib/server/identifiers/adminReservations.ts
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { isValidNameFormat } from './reservedPatterns';

export type CreateAdminReservationResult =
  | { ok: true; name: string; reason: string; actorPubkey: string; createdAt: Date }
  | { ok: false; reason: 'invalid_name' | 'reason_required' | 'name_claimed' | 'name_already_reserved' };

export async function createAdminReservation(
  actorPubkey: string,
  rawName: string,
  rawReason: string
): Promise<CreateAdminReservationResult> {
  const name = rawName.toLowerCase();
  const reason = rawReason.trim();
  if (!isValidNameFormat(name)) return { ok: false, reason: 'invalid_name' };
  if (!reason) return { ok: false, reason: 'reason_required' };

  try {
    const createdAt = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(identifiers)
        .values({ name, status: 'reserved', ownerPubkey: null })
        .returning({ createdAt: identifiers.createdAt });
      await tx.insert(identifierEvents).values({
        identifierName: name,
        eventType: 'reserved',
        actorPubkey,
        reason
      });
      return created.createdAt;
    });
    return { ok: true, name, reason, actorPubkey, createdAt };
  } catch (error) {
    const pgError = error as { code?: string; constraint_name?: string };
    if (pgError.code !== '23505' || pgError.constraint_name !== 'identifiers_name_unique') {
      throw error;
    }
    const [existing] = await db
      .select({ status: identifiers.status })
      .from(identifiers)
      .where(eq(identifiers.name, name))
      .limit(1);
    return {
      ok: false,
      reason: existing?.status === 'claimed' ? 'name_claimed' : 'name_already_reserved'
    };
  }
}
```

- [ ] **Step 4: Run the service tests and verify GREEN**

Run: `pnpm vitest run src/lib/server/identifiers/adminReservations.test.ts`

Expected: all service tests pass.

- [ ] **Step 5: Write the failing thin-route tests**

```ts
// src/routes/api/admin/reservations/server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { POST } from './+server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const NON_ADMIN_PUBKEY = 'd'.repeat(64);
const TEST_NAME = 'admin-reservation-test';
const CLAIMED_OWNER = '5202000000000000000000000000000000000000000000000000000000000000';

function requestEvent(body: unknown, user: { pubkey: string } | null) {
  return {
    request: new Request('https://phostrich.test/api/admin/reservations', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/admin/reservations', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, null));
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: NON_ADMIN_PUBKEY }));
    expect(response.status).toBe(403);
  });

  it('maps a created reservation to its normalized response', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME.toUpperCase(), reason: '  trademark hold  ' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      name: TEST_NAME,
      reason: 'trademark hold',
      actorPubkey: ADMIN_PUBKEY,
      createdAt: expect.any(String)
    });
  });

  it('returns 400 when reason is whitespace-only', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: '   ' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'reason_required' });
  });

  it('returns 409 when the name is already claimed', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: CLAIMED_OWNER });
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'name_claimed' });
  });
});
```

- [ ] **Step 6: Run route tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/admin/reservations/server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 7: Write the thin route adapter**

```ts
// src/routes/api/admin/reservations/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/admin';
import { createAdminReservation } from '$lib/server/identifiers/adminReservations';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const adminPubkey = locals.user.pubkey;
  if (!isAdmin(adminPubkey)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.name !== 'string' || typeof body?.reason !== 'string') {
    return json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await createAdminReservation(adminPubkey, body.name, body.reason);
  if (!result.ok) {
    const status = result.reason === 'invalid_name' || result.reason === 'reason_required' ? 400 : 409;
    return json({ error: result.reason }, { status });
  }
  return json(
    {
      name: result.name,
      reason: result.reason,
      actorPubkey: result.actorPubkey,
      createdAt: result.createdAt.toISOString()
    },
    { status: 201 }
  );
};
```

- [ ] **Step 8: Run service and route tests to verify they pass**

Run: `pnpm vitest run src/lib/server/identifiers/adminReservations.test.ts "src/routes/api/admin/reservations/server.test.ts"`
Expected: both files pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/identifiers/adminReservations.ts \
  src/lib/server/identifiers/adminReservations.test.ts \
  "src/routes/api/admin/reservations/+server.ts" \
  "src/routes/api/admin/reservations/server.test.ts"
git commit -m "feat: add POST /api/admin/reservations"
```

---

### Task 7: `DELETE /api/admin/reservations/[name]`

**Files:**
- Modify: `src/lib/server/identifiers/adminReservations.ts`
- Modify: `src/lib/server/identifiers/adminReservations.test.ts`
- Create: `src/routes/api/admin/reservations/[name]/+server.ts`
- Test: `src/routes/api/admin/reservations/[name]/server.test.ts`

**Interfaces:**
- Produces: `removeAdminReservation(actorPubkey, name): Promise<{ok: true} | {ok: false; reason: 'not_found'}>` in the Task 6 service. The service owns the conditional delete and same-transaction audit.
- Route consumes: `isAdmin` and `removeAdminReservation`; it only authenticates, parses the path, calls, and maps.
- Produces: `DELETE: RequestHandler` — `{ok: true}` on 200, 401 unauthenticated, 403 non-admin, 404 if no matching reserved row (including if the name is actually claimed)

- [ ] **Step 1: Write failing service tests for conditional removal and atomic audit**

In `adminReservations.test.ts`, import `removeAdminReservation`, add the following constants **before** `FIXTURE_NAMES`, and include both names in that cleanup array:

```ts
const REMOVE_NAME = 'admin-service-reservation-remove';
const REMOVE_CLAIMED_NAME = 'admin-service-reservation-remove-claimed';
const REMOVE_OWNER = '5203000000000000000000000000000000000000000000000000000000000000';
```

Append these tests inside the existing service describe:

```ts
it('does not remove or audit a claimed row', async () => {
  await db.insert(identifiers).values({
    name: REMOVE_CLAIMED_NAME,
    status: 'claimed',
    ownerPubkey: REMOVE_OWNER
  });

  await expect(removeAdminReservation(ADMIN_PUBKEY, REMOVE_CLAIMED_NAME)).resolves.toEqual({
    ok: false,
    reason: 'not_found'
  });
  expect(
    await db.select().from(identifiers).where(eq(identifiers.name, REMOVE_CLAIMED_NAME))
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, REMOVE_CLAIMED_NAME))
  ).toHaveLength(0);
});

it('removes a reserved row and writes exactly one audit event', async () => {
  await db.insert(identifiers).values({
    name: REMOVE_NAME,
    status: 'reserved',
    ownerPubkey: null
  });

  await expect(removeAdminReservation(ADMIN_PUBKEY, REMOVE_NAME)).resolves.toEqual({
    ok: true,
    name: REMOVE_NAME
  });
  expect(
    await db.select().from(identifiers).where(eq(identifiers.name, REMOVE_NAME))
  ).toHaveLength(0);
  const events = await db
    .select()
    .from(identifierEvents)
    .where(eq(identifierEvents.identifierName, REMOVE_NAME));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    eventType: 'reservation_removed',
    actorPubkey: ADMIN_PUBKEY,
    reason: null
  });
});
```

- [ ] **Step 2: Run the focused service tests and verify RED**

Run: `pnpm vitest run src/lib/server/identifiers/adminReservations.test.ts -t "remove|removal"`

Expected: FAIL — `removeAdminReservation` is not exported.

- [ ] **Step 3: Implement the service transaction**

```ts
export type RemoveAdminReservationResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'not_found' };

export async function removeAdminReservation(
  actorPubkey: string,
  name: string
): Promise<RemoveAdminReservationResult> {
  const deletedName = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(identifiers)
      .where(and(eq(identifiers.name, name), eq(identifiers.status, 'reserved')))
      .returning({ name: identifiers.name });
    if (!deleted) return null;
    await tx.insert(identifierEvents).values({
      identifierName: deleted.name,
      eventType: 'reservation_removed',
      actorPubkey,
      reason: null
    });
    return deleted.name;
  });
  return deletedName === null
    ? { ok: false, reason: 'not_found' }
    : { ok: true, name: deletedName };
}
```

Add `and` to the existing Drizzle import in `adminReservations.ts`.

- [ ] **Step 4: Run the service tests and verify GREEN**

Run: `pnpm vitest run src/lib/server/identifiers/adminReservations.test.ts`

Expected: all reservation service tests pass.

- [ ] **Step 5: Write the failing route tests**

```ts
// src/routes/api/admin/reservations/[name]/server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { DELETE } from './+server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const NON_ADMIN_PUBKEY = 'd'.repeat(64);
const TEST_NAME = 'admin-reservation-delete-test';
const CLAIMED_OWNER = '5301000000000000000000000000000000000000000000000000000000000000';

function requestEvent(name: string, user: { pubkey: string } | null) {
  return { params: { name }, locals: { user } } as unknown as Parameters<typeof DELETE>[0];
}

describe('DELETE /api/admin/reservations/[name]', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await DELETE(requestEvent(TEST_NAME, null));
    expect(response.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: NON_ADMIN_PUBKEY }));
    expect(response.status).toBe(403);
  });

  it('returns 404 when there is no matching reserved row', async () => {
    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(404);
  });

  it('never deletes a claimed row', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: CLAIMED_OWNER });
    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(404);
  });

  it('maps a successful service removal to 200', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'reserved', ownerPubkey: null });

    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 6: Run route tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/admin/reservations/[name]/server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 7: Write the thin route adapter**

```ts
// src/routes/api/admin/reservations/[name]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/admin';
import { removeAdminReservation } from '$lib/server/identifiers/adminReservations';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const adminPubkey = locals.user.pubkey;
  if (!isAdmin(adminPubkey)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await removeAdminReservation(adminPubkey, params.name!);
  if (!result.ok) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  return json({ ok: true });
};
```

- [ ] **Step 8: Run service and route tests to verify they pass**

Run: `pnpm vitest run src/lib/server/identifiers/adminReservations.test.ts "src/routes/api/admin/reservations/[name]/server.test.ts"`
Expected: both files pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/identifiers/adminReservations.ts \
  src/lib/server/identifiers/adminReservations.test.ts \
  "src/routes/api/admin/reservations/[name]/+server.ts" \
  "src/routes/api/admin/reservations/[name]/server.test.ts"
git commit -m "feat: add DELETE /api/admin/reservations/[name]"
```

---

### Task 8: `POST /api/admin/force-release`

**Files:**
- Create: `src/lib/server/identifiers/adminForceRelease.ts`
- Test: `src/lib/server/identifiers/adminForceRelease.test.ts`
- Create: `src/routes/api/admin/force-release/+server.ts`
- Test: `src/routes/api/admin/force-release/server.test.ts`

**Interfaces:**
- Service consumes: the shared `staleIdentifierCondition()` from Task 5 plus `db`, schema, and `invalidateIdentifier` through relative server-only imports.
- Produces: `forceReleaseAdminIdentifier(actorPubkey, rawName, rawReason): Promise<ForceReleaseAdminIdentifierResult>`. It normalizes input, rejects blank reasons, conditionally deletes and audits in one transaction, and invalidates only after commit.
- Route consumes: `isAdmin` and `forceReleaseAdminIdentifier`; it only authenticates, parses string shapes, calls, and maps.
- Produces: `POST: RequestHandler` — `{ok: true}` on 200, 400 (missing name/reason), 401 unauthenticated, 403 non-admin, 404 not found, 409 not actually stale

- [ ] **Step 1: Write failing service tests for validation and the destructive transaction**

Create the complete service test file:

```ts
// src/lib/server/identifiers/adminForceRelease.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { valkey } from '../valkey';
import { forceReleaseAdminIdentifier } from './adminForceRelease';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const TEST_NAME = 'admin-service-force-release';
const TEST_OWNER = '5401000000000000000000000000000000000000000000000000000000000000';
const CACHE_KEY = 'identifier:' + TEST_NAME;

describe('admin force-release service', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del(CACHE_KEY);
  });

  it('rejects a whitespace-only reason without changing row, event, or cache', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: new Date('2025-01-01T00:00:00.000Z')
    });
    await valkey.set(CACHE_KEY, 'cached', 'EX', 300);

    await expect(forceReleaseAdminIdentifier(ADMIN_PUBKEY, TEST_NAME, '   ')).resolves.toEqual({
      ok: false,
      reason: 'reason_required'
    });
    expect(
      await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME))
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(identifierEvents)
        .where(eq(identifierEvents.identifierName, TEST_NAME))
    ).toHaveLength(0);
    expect(await valkey.get(CACHE_KEY)).toBe('cached');
  });

  it('reports a fresh claimed row as not eligible without auditing it', async () => {
    const lastIdentifiedAt = new Date();
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt
    });

    await expect(
      forceReleaseAdminIdentifier(ADMIN_PUBKEY, TEST_NAME, 'reason')
    ).resolves.toEqual({ ok: false, reason: 'not_eligible', lastIdentifiedAt });
    expect(
      await db
        .select()
        .from(identifierEvents)
        .where(eq(identifierEvents.identifierName, TEST_NAME))
    ).toHaveLength(0);
  });

  it('reports a missing identifier', async () => {
    await expect(
      forceReleaseAdminIdentifier(ADMIN_PUBKEY, TEST_NAME, 'reason')
    ).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('atomically releases stale data, trims the audit reason, and invalidates cache', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: new Date('2025-01-01T00:00:00.000Z')
    });
    await valkey.set(CACHE_KEY, 'cached', 'EX', 300);

    await expect(
      forceReleaseAdminIdentifier(ADMIN_PUBKEY, TEST_NAME, '  reported impersonation  ')
    ).resolves.toEqual({
      ok: true,
      name: TEST_NAME,
      reason: 'reported impersonation'
    });

    expect(
      await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME))
    ).toHaveLength(0);
    const events = await db
      .select()
      .from(identifierEvents)
      .where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'force_released',
      actorPubkey: ADMIN_PUBKEY,
      reason: 'reported impersonation'
    });
    expect(await valkey.get(CACHE_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the service tests and verify RED**

Run: `pnpm vitest run src/lib/server/identifiers/adminForceRelease.test.ts`

Expected: FAIL — `adminForceRelease.ts` does not exist.

- [ ] **Step 3: Implement the focused force-release service**

```ts
// src/lib/server/identifiers/adminForceRelease.ts
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { invalidateIdentifier } from '../db/identifiers';
import { staleIdentifierCondition } from './adminQueries';

export type ForceReleaseAdminIdentifierResult =
  | { ok: true; name: string; reason: string }
  | { ok: false; reason: 'invalid_name' | 'reason_required' | 'not_found' }
  | { ok: false; reason: 'not_eligible'; lastIdentifiedAt: Date };

export async function forceReleaseAdminIdentifier(
  actorPubkey: string,
  rawName: string,
  rawReason: string
): Promise<ForceReleaseAdminIdentifierResult> {
  const name = rawName.toLowerCase();
  const reason = rawReason.trim();
  if (!name) return { ok: false, reason: 'invalid_name' };
  if (!reason) return { ok: false, reason: 'reason_required' };

  const deletedName = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(identifiers)
      .where(
        and(
          eq(identifiers.name, name),
          eq(identifiers.status, 'claimed'),
          staleIdentifierCondition()
        )
      )
      .returning({ name: identifiers.name });
    if (!deleted) return null;
    await tx.insert(identifierEvents).values({
      identifierName: deleted.name,
      eventType: 'force_released',
      actorPubkey,
      reason
    });
    return deleted.name;
  });

  if (deletedName === null) {
    const [current] = await db
      .select({ lastIdentifiedAt: identifiers.lastIdentifiedAt })
      .from(identifiers)
      .where(eq(identifiers.name, name))
      .limit(1);
    return current
      ? { ok: false, reason: 'not_eligible', lastIdentifiedAt: current.lastIdentifiedAt }
      : { ok: false, reason: 'not_found' };
  }

  await invalidateIdentifier(deletedName);
  return { ok: true, name: deletedName, reason };
}
```

- [ ] **Step 4: Run the service tests and verify GREEN**

Run: `pnpm vitest run src/lib/server/identifiers/adminForceRelease.test.ts`

Expected: all force-release service tests pass.

- [ ] **Step 5: Write the failing route tests**

```ts
// src/routes/api/admin/force-release/server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { POST } from './+server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const NON_ADMIN_PUBKEY = 'e'.repeat(64);
const TEST_NAME = 'admin-force-release-test';
const TEST_OWNER = '5402000000000000000000000000000000000000000000000000000000000000';

function requestEvent(body: unknown, user: { pubkey: string } | null) {
  return {
    request: new Request('https://phostrich.test/api/admin/force-release', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/admin/force-release', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, null));
    expect(response.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: NON_ADMIN_PUBKEY })
    );
    expect(response.status).toBe(403);
  });

  it('returns 404 when the identifier does not exist', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(404);
  });

  it('returns 400 when reason is whitespace-only', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: '   ' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'reason_required' });
  });

  it('returns 409 when the identifier is not actually stale', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(409);
  });

  it('maps a genuinely stale identifier to a successful response', async () => {
    const staleAt = new Date('2025-01-01T00:00:00.000Z');
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: staleAt
    });
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: '  reported impersonation  ' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 6: Run route tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/admin/force-release/server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 7: Write the thin route adapter**

```ts
// src/routes/api/admin/force-release/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/auth/admin';
import { forceReleaseAdminIdentifier } from '$lib/server/identifiers/adminForceRelease';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const adminPubkey = locals.user.pubkey;
  if (!isAdmin(adminPubkey)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.name !== 'string' || typeof body?.reason !== 'string') {
    return json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await forceReleaseAdminIdentifier(adminPubkey, body.name, body.reason);
  if (!result.ok) {
    if (result.reason === 'invalid_name' || result.reason === 'reason_required') {
      return json({ error: result.reason }, { status: 400 });
    }
    if (result.reason === 'not_found') {
      return json({ error: 'not_found' }, { status: 404 });
    }
    return json(
      { error: 'no_longer_eligible', lastIdentifiedAt: result.lastIdentifiedAt.toISOString() },
      { status: 409 }
    );
  }

  return json({ ok: true });
};
```

- [ ] **Step 8: Run service and route tests to verify they pass**

Run: `pnpm vitest run src/lib/server/identifiers/adminForceRelease.test.ts "src/routes/api/admin/force-release/server.test.ts"`
Expected: both files pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/identifiers/adminForceRelease.ts \
  src/lib/server/identifiers/adminForceRelease.test.ts \
  "src/routes/api/admin/force-release/+server.ts" \
  "src/routes/api/admin/force-release/server.test.ts"
git commit -m "feat: add POST /api/admin/force-release"
```

---

### Task 9: `/admin` load guard

**Files:**
- Create: `src/routes/admin/+page.server.ts`
- Test: `src/routes/admin/page.server.test.ts`

**Interfaces:**
- Consumes: `isAdmin` from Task 2, `getStaleIdentifiers`/`getReservations` from Task 5
- Produces: `load: PageServerLoad` returning `{stale: {...}[]; reservations: {...}[]}` — redirects `/login` unauthenticated, `403` non-admin

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/admin/page.server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const NON_ADMIN_PUBKEY = '1'.repeat(64);
const TEST_NAME = 'admin-page-load-test';
const TEST_OWNER = '5501000000000000000000000000000000000000000000000000000000000000';

function loadEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as unknown as Parameters<typeof load>[0];
}

describe('admin page load', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('redirects to /login when unauthenticated', async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 302, location: '/login' });
  });

  it('returns 403 for a non-admin', async () => {
    await expect(load(loadEvent({ pubkey: NON_ADMIN_PUBKEY }))).rejects.toMatchObject({ status: 403 });
  });

  it('returns stale and reservation lists for an admin', async () => {
    const staleAt = new Date('2025-01-01T00:00:00.000Z');
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      lastIdentifiedAt: staleAt
    });

    const result = await load(loadEvent({ pubkey: ADMIN_PUBKEY }));
    expect(result.stale.some((s) => s.name === TEST_NAME)).toBe(true);
    expect(Array.isArray(result.reservations)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/routes/admin/page.server.test.ts`
Expected: FAIL — `./+page.server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/admin/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isAdmin } from '$lib/server/auth/admin';
import { getReservations, getStaleIdentifiers } from '$lib/server/identifiers/adminQueries';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }
  if (!isAdmin(locals.user.pubkey)) {
    error(403, 'Forbidden');
  }

  const [stale, reservations] = await Promise.all([getStaleIdentifiers(), getReservations()]);

  return {
    stale: stale.map((s) => ({
      name: s.name,
      ownerPubkey: s.ownerPubkey,
      lastIdentifiedAt: s.lastIdentifiedAt.toISOString()
    })),
    reservations: reservations.map((r) => ({
      name: r.name,
      reason: r.reason,
      actorPubkey: r.actorPubkey,
      createdAt: r.createdAt.toISOString()
    }))
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/routes/admin/page.server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin/+page.server.ts src/routes/admin/page.server.test.ts
git commit -m "feat: add /admin load guard"
```

---

### Task 10: `/admin` screen

**Files:**
- Create: `src/lib/client/adminForm.ts`
- Test: `src/lib/client/adminForm.test.ts`
- Create: `src/routes/admin/+page.svelte`
- Test: `src/routes/admin/page.test.ts`

**Interfaces:**
- Produces three typed, total helpers: `createReservation`, `removeReservation`, and `forceReleaseIdentifier`. Every helper catches request rejection, validates success payloads, safely parses failure payloads, and returns an operation-specific fallback instead of throwing or exposing raw exceptions.
- Consumes: the three helpers plus `CredentialCard` (Claim flow, `$lib/client/CredentialCard.svelte`). The component never calls `fetch` directly.
- Produces: the `/admin` route with mounted regression coverage for all three pending/finalizer paths and both dialog accessibility contracts.

**Accessibility correction:** force-release and reservation-remove are destructive hard-interrupt dialogs. On open each records its launcher and focuses a safe control; Tab and Shift+Tab stay contained; Escape closes only while idle; Cancel, Escape, and failed requests restore focus. Network failures become concise user-safe errors and never leave either dialog busy or unusable.

Both dialogs must have a visible `<h2>` and visible consequence description. Wire stable `aria-labelledby` and `aria-describedby` ids to those elements. Add mounted/Playwright coverage for both accessible names and descriptions, safe initial Cancel focus, forward and reverse wrapping through force-release reason/action/Cancel and removal action/Cancel, idle Escape focus restoration, rejected-request recovery, and no outside-click dismissal.

- [ ] **Step 1: Write failing tests for total Admin request helpers**

Create `adminForm.test.ts`. For **each of all three helpers**, use a rejecting fetcher and assert the promise resolves to its operation-specific safe error. Repeat with malformed success/failure response bodies. Also cover each valid success payload and known error-code mapping. Inject `fetcher: typeof fetch = fetch` so the tests do not mutate global transport state.

The required fallbacks are:

```ts
const CREATE_FALLBACK = 'We could not add this reservation. Please try again.';
const REMOVE_FALLBACK = 'We could not remove the reservation. Please try again.';
const RELEASE_FALLBACK = 'We could not force-release this identifier. Please try again.';
```

Run: `pnpm vitest run src/lib/client/adminForm.test.ts`

Expected: FAIL — `adminForm.ts` does not exist.

- [ ] **Step 2: Implement typed total helpers**

```ts
// src/lib/client/adminForm.ts
export type AdminWriteResult<T> = { ok: true; value: T } | { ok: false; error: string };
type Fetcher = typeof fetch;

const CREATE_FALLBACK = 'We could not add this reservation. Please try again.';
const REMOVE_FALLBACK = 'We could not remove the reservation. Please try again.';
const RELEASE_FALLBACK = 'We could not force-release this identifier. Please try again.';

const ERROR_COPY: Record<string, string> = {
  invalid_name: 'Enter a valid identifier name.',
  reason_required: 'Enter a reason before continuing.',
  name_claimed: 'That name is currently claimed.',
  name_already_reserved: 'That name is already reserved.',
  not_found: 'That record no longer exists.',
  no_longer_eligible: 'That identifier is no longer eligible for release.'
};

async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  const body = await response.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function failure(body: Record<string, unknown> | null, fallback: string): AdminWriteResult<never> {
  const code = typeof body?.error === 'string' ? body.error : '';
  return { ok: false, error: ERROR_COPY[code] ?? fallback };
}

export async function createReservation(
  name: string,
  reason: string,
  fetcher: Fetcher = fetch
): Promise<
  AdminWriteResult<{ name: string; reason: string; actorPubkey: string; createdAt: string }>
> {
  try {
    const response = await fetcher('/api/admin/reservations', {
      method: 'POST',
      body: JSON.stringify({ name, reason })
    });
    const body = await readBody(response);
    if (
      response.status === 201 &&
      typeof body?.name === 'string' &&
      typeof body.reason === 'string' &&
      typeof body.actorPubkey === 'string' &&
      typeof body.createdAt === 'string'
    ) {
      return {
        ok: true,
        value: {
          name: body.name,
          reason: body.reason,
          actorPubkey: body.actorPubkey,
          createdAt: body.createdAt
        }
      };
    }
    return failure(body, CREATE_FALLBACK);
  } catch {
    return { ok: false, error: CREATE_FALLBACK };
  }
}

export async function removeReservation(
  name: string,
  fetcher: Fetcher = fetch
): Promise<AdminWriteResult<null>> {
  try {
    const response = await fetcher(`/api/admin/reservations/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
    const body = await readBody(response);
    return response.status === 200 && body?.ok === true
      ? { ok: true, value: null }
      : failure(body, REMOVE_FALLBACK);
  } catch {
    return { ok: false, error: REMOVE_FALLBACK };
  }
}

export async function forceReleaseIdentifier(
  name: string,
  reason: string,
  fetcher: Fetcher = fetch
): Promise<AdminWriteResult<null>> {
  try {
    const response = await fetcher('/api/admin/force-release', {
      method: 'POST',
      body: JSON.stringify({ name, reason })
    });
    const body = await readBody(response);
    return response.status === 200 && body?.ok === true
      ? { ok: true, value: null }
      : failure(body, RELEASE_FALLBACK);
  } catch {
    return { ok: false, error: RELEASE_FALLBACK };
  }
}
```

Run the Step 1 command. Expected: all helper tests pass.

- [ ] **Step 3: Write the mounted RED tests for component recovery and dialogs**

Create `src/routes/admin/page.test.ts` in Happy DOM and mount the real Svelte component. Before implementation, add tests proving:

1. A pending reservation create disables Add, ignores a second click, and always re-enables with the create fallback after rejection/malformed response.
2. Pending force release and reservation removal each ignore a second submit, keep focus trapped while controls are disabled, and restore an enabled safe action plus the operation-specific error after settlement.
3. The force-release dialog is named by `Force release <name>?` and described by its visible consequence copy.
4. The removal dialog is named by `Remove reservation for <name>?` and described by its visible consequence copy.
5. Whitespace-only reason values leave Add reservation / Force release disabled; trimmed successful values are rendered from the server-normalized helper result.

Run: `pnpm vitest run src/routes/admin/page.test.ts`

Expected: FAIL — `+page.svelte` does not exist.

- [ ] **Step 4: Write `+page.svelte`**

```svelte
<!-- src/routes/admin/+page.svelte -->
<script lang="ts">
  import { tick } from 'svelte';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import {
    createReservation,
    forceReleaseIdentifier,
    removeReservation
  } from '$lib/client/adminForm';

  let { data } = $props<{
    data: {
      stale: { name: string; ownerPubkey: string | null; lastIdentifiedAt: string }[];
      reservations: { name: string; reason: string | null; actorPubkey: string | null; createdAt: string }[];
    };
  }>();

  let stale = $state<typeof data.stale>([]);
  let reservations = $state<typeof data.reservations>([]);

  let releaseTarget = $state<string | null>(null);
  let releaseReason = $state('');
  let releaseError = $state('');
  let releasePending = $state(false);
  let reservationRemovalTarget = $state<string | null>(null);
  let removalError = $state('');
  let removalPending = $state(false);
  let destructiveLauncher = $state<HTMLButtonElement>();
  let destructiveSafeAction = $state<HTMLButtonElement>();
  let destructiveDialog = $state<HTMLDivElement>();

  let newReservationName = $state('');
  let newReservationReason = $state('');
  let reservationError = $state('');
  let reservationPending = $state(false);

  $effect(() => {
    stale = [...data.stale];
    reservations = [...data.reservations];
  });

  function openReleaseModal(name: string, launcher: HTMLButtonElement) {
    destructiveLauncher = launcher;
    releaseTarget = name;
    releaseReason = '';
    releaseError = '';
    void tick().then(() => destructiveSafeAction?.focus());
  }

  function openReservationRemoval(name: string, launcher: HTMLButtonElement) {
    destructiveLauncher = launcher;
    reservationRemovalTarget = name;
    removalError = '';
    void tick().then(() => destructiveSafeAction?.focus());
  }

  function closeDestructiveDialog(kind: 'release' | 'reservation') {
    if (releasePending || removalPending) return;
    if (kind === 'release') releaseTarget = null;
    else reservationRemovalTarget = null;
    void tick().then(() => destructiveLauncher?.focus());
  }

  function handleDestructiveKeydown(event: KeyboardEvent, pending: boolean) {
    if (event.key === 'Escape') {
      if (!pending) { event.preventDefault(); closeDestructiveDialog(releaseTarget ? 'release' : 'reservation'); }
      return;
    }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (pending) { destructiveDialog?.focus(); return; }
    const focusable = [...(destructiveDialog?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])') ?? [])];
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
  }

  async function confirmForceRelease() {
    if (!releaseTarget || !releaseReason.trim() || releasePending) return;
    const target = releaseTarget;
    releasePending = true;
    releaseError = '';
    void tick().then(() => destructiveDialog?.focus());
    try {
      const result = await forceReleaseIdentifier(target, releaseReason);
      if (result.ok) {
        stale = stale.filter((row) => row.name !== target);
        releaseTarget = null;
      } else {
        releaseError = result.error;
      }
    } finally {
      releasePending = false;
      if (releaseError) void tick().then(() => destructiveSafeAction?.focus());
    }
  }

  async function addReservation() {
    if (!newReservationName.trim() || !newReservationReason.trim() || reservationPending) return;
    reservationPending = true;
    reservationError = '';
    try {
      const result = await createReservation(newReservationName, newReservationReason);
      if (result.ok) {
        reservations = [...reservations, result.value];
        newReservationName = '';
        newReservationReason = '';
      } else {
        reservationError = result.error;
      }
    } finally {
      reservationPending = false;
    }
  }

  async function confirmReservationRemoval() {
    if (!reservationRemovalTarget || removalPending) return;
    const target = reservationRemovalTarget;
    removalPending = true;
    removalError = '';
    void tick().then(() => destructiveDialog?.focus());
    try {
      const result = await removeReservation(target);
      if (result.ok) {
        reservations = reservations.filter((row) => row.name !== target);
        reservationRemovalTarget = null;
      } else {
        removalError = result.error;
      }
    } finally {
      removalPending = false;
      if (removalError) void tick().then(() => destructiveSafeAction?.focus());
    }
  }
</script>

<CredentialCard title="Admin">
  <h2>Stale identifiers</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Owner</th><th>Last NIP-05 lookup</th><th></th></tr>
    </thead>
    <tbody>
      {#each stale as row}
        <tr>
          <td>{row.name}</td>
          <td>{row.ownerPubkey}</td>
          <td>{new Date(row.lastIdentifiedAt).toLocaleDateString()}</td>
          <td><button onclick={(event) => openReleaseModal(row.name, event.currentTarget)}>Force release</button></td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h2>Reservations</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Reason</th><th>Set by</th><th></th></tr>
    </thead>
    <tbody>
      {#each reservations as row}
        <tr>
          <td>{row.name}</td>
          <td>{row.reason}</td>
          <td>{row.actorPubkey}</td>
          <td><button onclick={(event) => openReservationRemoval(row.name, event.currentTarget)}>Remove</button></td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h3>Add reservation</h3>
  <label for="reservation-name">Name</label>
  <input id="reservation-name" bind:value={newReservationName} />
  <label for="reservation-reason">Reason</label>
  <input id="reservation-reason" bind:value={newReservationReason} />
  <button
    onclick={addReservation}
    disabled={!newReservationName.trim() || !newReservationReason.trim() || reservationPending}
  >
    {reservationPending ? 'Adding…' : 'Add reservation'}
  </button>
  {#if reservationError}
    <p class="error" role="alert">{reservationError}</p>
  {/if}
</CredentialCard>

{#if releaseTarget}
  <div
    bind:this={destructiveDialog}
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="force-release-title"
    aria-describedby="force-release-description"
    tabindex="-1"
    onkeydown={(event) => handleDestructiveKeydown(event, releasePending)}
  >
    <div class="modal__content">
      <h2 id="force-release-title">Force release {releaseTarget}?</h2>
      <p id="force-release-description">
        This makes the identifier available for anyone else to claim and cannot be undone.
      </p>
      <label for="release-reason">Reason (required)</label>
      <input id="release-reason" bind:value={releaseReason} />
      <button
        onclick={confirmForceRelease}
        disabled={!releaseReason.trim() || releasePending}
        aria-busy={releasePending}
      >
        Force release {releaseTarget}
      </button>
      <button bind:this={destructiveSafeAction} onclick={() => closeDestructiveDialog('release')} disabled={releasePending}>Cancel</button>
      {#if releaseError}
        <p class="error" role="alert">{releaseError}</p>
      {/if}
    </div>
  </div>
{/if}

{#if reservationRemovalTarget}
  <div
    bind:this={destructiveDialog}
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="reservation-removal-title"
    aria-describedby="reservation-removal-description"
    tabindex="-1"
    onkeydown={(event) => handleDestructiveKeydown(event, removalPending)}
  >
    <div class="modal__content">
      <h2 id="reservation-removal-title">
        Remove reservation for {reservationRemovalTarget}?
      </h2>
      <p id="reservation-removal-description">
        This makes the name available for anyone else to claim.
      </p>
      {#if removalError}<p class="error" role="alert">{removalError}</p>{/if}
      <button onclick={confirmReservationRemoval} disabled={removalPending} aria-busy={removalPending}>
        Remove reservation
      </button>
      <button bind:this={destructiveSafeAction} onclick={() => closeDestructiveDialog('reservation')} disabled={removalPending}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: 0.875rem;
  }
  th,
  td {
    border-bottom: 1px solid var(--color-line);
    padding: var(--space-1);
    text-align: left;
  }
  .error {
    color: var(--color-accent-rose-text);
  }
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(46, 42, 51, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .modal__content {
    background: white;
    max-width: 24rem;
    padding: var(--space-4);
  }
</style>
```

- [ ] **Step 5: Verify mounted tests, helper tests, build, and type checks**

Run:

```bash
pnpm vitest run src/lib/client/adminForm.test.ts src/routes/admin/page.test.ts
pnpm check
pnpm build
```

Expected: all commands succeed; every Admin write has rejection, malformed-response, pending, and double-submit coverage.

- [ ] **Step 6: Commit**

```bash
git add src/lib/client/adminForm.ts src/lib/client/adminForm.test.ts \
  src/routes/admin/+page.svelte src/routes/admin/page.test.ts
git commit -m "feat: add /admin screen"
```

---

### Task 11: Playwright e2e — admin dashboard

**Files:**
- Create: `tests/e2e/helpers/fixedAdminSigner.ts`
- Create: `tests/e2e/admin-dashboard.spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1–10; `finalizeEvent`, `getPublicKey` from `nostr-tools`; `db`, `identifiers`, and `identifierEvents` for explicit e2e fixture setup and cleanup
- Produces: `installFixedAdminExtension(page: Page): Promise<void>` and `signInAsFixedAdmin(page: Page): Promise<void>` from `tests/e2e/helpers/fixedAdminSigner.ts`; passing e2e coverage for both destructive Admin dialogs

- [ ] **Step 1: Write `tests/e2e/helpers/fixedAdminSigner.ts`**

```ts
// tests/e2e/helpers/fixedAdminSigner.ts
import type { Page } from '@playwright/test';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

// Fixed, not random: this pubkey must already be in .env's ADMIN_PUBKEYS before the
// server starts, unlike the other e2e tests' fresh-random-keypair-per-run pattern.
const FIXED_ADMIN_SECRET_KEY = new Uint8Array(32).fill(0xaa);

export async function installFixedAdminExtension(page: Page): Promise<void> {
  const pubkey = getPublicKey(FIXED_ADMIN_SECRET_KEY);
  await page.exposeFunction('__testGetPublicKey', () => pubkey);
  await page.exposeFunction('__testSignEvent', (template: unknown) => {
    return finalizeEvent(template as Parameters<typeof finalizeEvent>[0], FIXED_ADMIN_SECRET_KEY);
  });

  await page.addInitScript(() => {
    window.nostr = {
      // @ts-expect-error test-only global bridge
      getPublicKey: () => window.__testGetPublicKey(),
      // @ts-expect-error test-only global bridge
      signEvent: (template: unknown) => window.__testSignEvent(template)
    };
  });
}

export async function signInAsFixedAdmin(page: Page): Promise<void> {
  await installFixedAdminExtension(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with extension' }).click();
  await page.waitForURL('**/claim');
}
```

- [ ] **Step 2: Write the test**

```ts
// tests/e2e/admin-dashboard.spec.ts
import { expect, test } from '@playwright/test';
import { inArray } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { identifierEvents, identifiers } from '../../src/lib/server/db/schema';
import { signInAsFixedAdmin } from './helpers/fixedAdminSigner';

const STALE_NAME = 'stale-e2e';
const RESERVATION_NAME = 'e2e-admin-reservation';
const FIXTURE_NAMES = [STALE_NAME, RESERVATION_NAME];
const STALE_OWNER = '5601000000000000000000000000000000000000000000000000000000000000';
const FORCE_RELEASE_ROUTE = '**/api/admin/force-release';
const REMOVE_RESERVATION_ROUTE = '**/api/admin/reservations/*';

async function cleanAdminFixtures(): Promise<void> {
  await db.delete(identifierEvents).where(inArray(identifierEvents.identifierName, FIXTURE_NAMES));
  await db.delete(identifiers).where(inArray(identifiers.name, FIXTURE_NAMES));
}

async function seedStaleClaimedIdentifier(): Promise<void> {
  await db.insert(identifiers).values({
    name: STALE_NAME,
    status: 'claimed',
    ownerPubkey: STALE_OWNER,
    lastIdentifiedAt: new Date('2025-01-01T00:00:00.000Z')
  });
}

test.beforeEach(cleanAdminFixtures);
test.afterEach(cleanAdminFixtures);

test('reservation removal contains focus and recovers from a rejected request', async ({ page }) => {
  await signInAsFixedAdmin(page);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Stale identifiers' })).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill(RESERVATION_NAME);
  await page.getByLabel('Reason', { exact: true }).fill('e2e test reservation');
  await page.getByRole('button', { name: 'Add reservation' }).click();
  const reservationRow = page.getByRole('row', { name: new RegExp(RESERVATION_NAME) });
  await expect(reservationRow).toBeVisible();

  const launcher = reservationRow.getByRole('button', { name: 'Remove', exact: true });
  await launcher.click();
  const dialog = page.getByRole('dialog', {
    name: `Remove reservation for ${RESERVATION_NAME}?`
  });
  await expect(dialog).toHaveAccessibleDescription(
    'This makes the name available for anyone else to claim.'
  );
  const action = dialog.getByRole('button', { name: 'Remove reservation' });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });

  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();

  await launcher.click();
  await page.mouse.click(0, 0);
  await expect(dialog).toBeVisible();

  let requestStartedResolve!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    requestStartedResolve = resolve;
  });
  let rejectRequest!: () => Promise<void>;
  await page.route(REMOVE_RESERVATION_ROUTE, async (route) => {
    requestStartedResolve();
    await new Promise<void>((resolve) => {
      rejectRequest = async () => {
        await route.abort('failed');
        resolve();
      };
    });
  });

  await action.click();
  await requestStarted;
  await expect(dialog).toBeFocused();
  await expect(action).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await rejectRequest();
  await expect(
    dialog.getByText('We could not remove the reservation. Please try again.')
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(action).toBeEnabled();
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();

  await page.unroute(REMOVE_RESERVATION_ROUTE);
  await action.click();
  await expect(reservationRow).toBeHidden();
});

test('force release contains focus and recovers from a rejected request', async ({ page }) => {
  await signInAsFixedAdmin(page);
  await seedStaleClaimedIdentifier();
  await page.goto('/admin');

  const staleRow = page.getByRole('row', { name: new RegExp(STALE_NAME) });
  await expect(staleRow).toBeVisible();
  const launcher = staleRow.getByRole('button', { name: 'Force release', exact: true });
  await launcher.click();
  const dialog = page.getByRole('dialog', { name: `Force release ${STALE_NAME}?` });
  await expect(dialog).toHaveAccessibleDescription(
    'This makes the identifier available for anyone else to claim and cannot be undone.'
  );
  const reason = dialog.getByLabel('Reason (required)');
  const action = dialog.getByRole('button', { name: `Force release ${STALE_NAME}` });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });

  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(reason).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await reason.fill('e2e recovery');
  await page.keyboard.press('Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();

  await launcher.click();
  await page.mouse.click(0, 0);
  await expect(dialog).toBeVisible();
  await reason.fill('e2e recovery');

  let requestStartedResolve!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    requestStartedResolve = resolve;
  });
  let rejectRequest!: () => Promise<void>;
  await page.route(FORCE_RELEASE_ROUTE, async (route) => {
    requestStartedResolve();
    await new Promise<void>((resolve) => {
      rejectRequest = async () => {
        await route.abort('failed');
        resolve();
      };
    });
  });

  await action.click();
  await requestStarted;
  await expect(dialog).toBeFocused();
  await expect(action).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await rejectRequest();
  await expect(
    dialog.getByText('We could not force-release this identifier. Please try again.')
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(action).toBeEnabled();
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();

  await page.unroute(FORCE_RELEASE_ROUTE);
  await action.click();
  await expect(staleRow).toBeHidden();
});
```

- [ ] **Step 3: Run the full e2e suite**

Run: `PUBLIC_ORIGIN=http://localhost:4173 pnpm test:e2e`
Expected: zero failures from the discovered Playwright suite. The remaining-work preflight restores `.env`, whose `ADMIN_PUBKEYS` includes `0000000000000000000000000000000000000000000000000000000000000000`; the command override aligns auth validation with Playwright's preview port.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/helpers/fixedAdminSigner.ts tests/e2e/admin-dashboard.spec.ts
git commit -m "test: add e2e coverage for the admin dashboard"
```

---

### Task 12: Full verification and docs

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–11
- Produces: a documented, end-to-end-verified admin dashboard

- [ ] **Step 1: Update `README.md`**

Add a new section after "Account management":

```markdown
## Admin dashboard

- `/admin` — visible only to pubkeys listed in `ADMIN_PUBKEYS`. Two sections: a live report of identifiers not looked up through NIP-05 for six calendar months (with force-release, reason required), and reservation management (add/remove, reason required on add).
- Admin actions are always audit-logged to `identifier_events` with the acting admin's pubkey.
```

- [ ] **Step 2: Run the full test suite with coverage**

Run: `pnpm test:coverage`
Expected: all tests pass (every prior sub-project's plus this plan's); coverage meets the 90% threshold.

- [ ] **Step 3: Run format, static checks, and a production build**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm build`
Expected: all succeed with no errors.

- [ ] **Step 4: Run the e2e suite**

Run: `PUBLIC_ORIGIN=http://localhost:4173 pnpm test:e2e`
Expected: zero failures from the discovered suite.

- [ ] **Step 5: Manual smoke test**

With `docker compose up -d`, migrations run, and `.env`'s `PUBLIC_ORIGIN`/`ADMIN_PUBKEYS` set for `pnpm dev`'s port: run `pnpm dev`, sign in with a NIP-07 extension whose pubkey is in `ADMIN_PUBKEYS`, visit `/admin`, add a reservation, confirm it appears, remove it, and confirm a non-admin pubkey gets a 403 on `/admin`.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document the admin dashboard"
```
