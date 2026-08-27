# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** The Foundation, Auth, Claim-flow, and Account-management plans must be implemented first. This plan builds on and amends Claim flow's `reservedPatterns.ts`, and reuses `CredentialCard.svelte`/design tokens and `invalidateIdentifier`. "Modify" steps show full resulting files rather than line ranges where the target file doesn't exist yet at time of writing.

**Goal:** Add the admin report page — a live staleness report with force-release, and reservation management — completing the write surfaces `docs/SPEC.md`'s Roles section describes.

**Architecture:** An `isAdmin` guard (config-based allowlist, injectable for testing) sits in front of one page (`/admin`) and three thin routes, mirroring every prior sub-project's layering. The report data comes from two small, independently testable query functions rather than inline route logic.

**Tech Stack:** SvelteKit 2, Drizzle ORM, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-admin-dashboard-design.md` (and `docs/SPEC.md`, `PRODUCT.md` for full context)

## Global Constraints

- Privileged logic only in `src/lib/server/**`, relative imports inside it — same as every prior sub-project.
- Admin is config-membership (`ADMIN_PUBKEYS`), not a DB role column. `isAdmin(pubkey, admins?)` takes an injectable list (defaulting to real config) so both branches are testable deterministically, same pattern as Account management's `validateRelayList`.
- `/admin`: unauthenticated → redirect `/login`; authenticated non-admin → `403` (not a disguising redirect).
- Staleness report is a **live query** — no background job dependency.
- Reservation creation validates format only (`isValidNameFormat`, not the reserved-pattern blocklist).
- Force-release re-verifies staleness server-side inside the same delete, never trusting the report snapshot the admin is looking at.
- Force-release requires a reason; reservation creation requires a reason. Reservation removal does not require one.
- Admin-facing conflict/error messages may be specific (unlike the public-facing endpoints) — the admin already sees the full picture in the report.
- `identifierEventType` gains `'reserved'` and `'reservation_removed'` — one new migration, nothing else about the schema changes.
- **Fixed test keypair for admin e2e**: secret key = 32 bytes of `0xaa`; its derived pubkey is `0000000000000000000000000000000000000000000000000000000000000000`. This exact pubkey goes into `.env.example`'s `ADMIN_PUBKEYS` (Task 1) — every other e2e test uses a fresh random keypair per run, but this one can't, since its pubkey must exist in config before the server starts.
- `.svelte` files stay excluded from the coverage threshold; verified by Playwright instead. 90% coverage gate applies to everything else.

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

src/routes/api/admin/
  reservations/+server.ts, +server.test.ts             — POST
  reservations/[name]/+server.ts, +server.test.ts       — DELETE
  force-release/+server.ts, +server.test.ts             — POST

src/routes/admin/
  +page.server.ts, +page.server.test.ts
  +page.svelte

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
- Produces: `getStaleIdentifiers(): Promise<StaleIdentifier[]>`, `getReservations(): Promise<Reservation[]>`, `interface StaleIdentifier { name: string; ownerPubkey: string | null; lastIdentifiedAt: Date }`, `interface Reservation { name: string; createdAt: Date; reason: string | null; actorPubkey: string | null }` from `src/lib/server/identifiers/adminQueries.ts`

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

describe('getStaleIdentifiers', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, STALE_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, FRESH_NAME));
  });

  it('returns only claimed identifiers older than 6 months, sorted oldest-first', async () => {
    const sevenMonthsAgo = new Date(Date.now() - 7 * 30 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await db.insert(identifiers).values({
      name: STALE_NAME,
      status: 'claimed',
      ownerPubkey: 'a'.repeat(64),
      lastIdentifiedAt: sevenMonthsAgo
    });
    await db.insert(identifiers).values({
      name: FRESH_NAME,
      status: 'claimed',
      ownerPubkey: 'b'.repeat(64),
      lastIdentifiedAt: oneMonthAgo
    });

    const result = await getStaleIdentifiers();
    const names = result.map((r) => r.name);
    expect(names).toContain(STALE_NAME);
    expect(names).not.toContain(FRESH_NAME);
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
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';

const STALE_AFTER_MS = 6 * 30 * 24 * 60 * 60 * 1000;

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

export async function getStaleIdentifiers(): Promise<StaleIdentifier[]> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  return db
    .select({
      name: identifiers.name,
      ownerPubkey: identifiers.ownerPubkey,
      lastIdentifiedAt: identifiers.lastIdentifiedAt
    })
    .from(identifiers)
    .where(and(eq(identifiers.status, 'claimed'), lt(identifiers.lastIdentifiedAt, cutoff)))
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
- Create: `src/routes/api/admin/reservations/+server.ts`
- Test: `src/routes/api/admin/reservations/+server.test.ts`

**Interfaces:**
- Consumes: `isAdmin` from Task 2, `isValidNameFormat` from Task 4, `identifiers`/`identifierEvents` (`$lib/server/db/schema`), `db` (`$lib/server/db`)
- Produces: `POST: RequestHandler` — `{name}` on 201, 400 (invalid name / missing reason), 401 unauthenticated, 403 non-admin, 409 (`name_claimed` or `name_already_reserved`)

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/api/admin/reservations/+server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { POST } from './+server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const NON_ADMIN_PUBKEY = 'd'.repeat(64);
const TEST_NAME = 'admin-reservation-test';

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

  it('creates a reservation with an audit row', async () => {
    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: 'trademark hold' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(201);

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.status).toBe('reserved');
    expect(row.ownerPubkey).toBeNull();

    const [event] = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(event.eventType).toBe('reserved');
    expect(event.reason).toBe('trademark hold');
    expect(event.actorPubkey).toBe(ADMIN_PUBKEY);
  });

  it('returns 400 when reason is missing', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME }, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(400);
  });

  it('returns 409 when the name is already claimed', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: 'e'.repeat(64) });
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'name_claimed' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/admin/reservations/+server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/api/admin/reservations/+server.ts
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { isAdmin } from '$lib/server/auth/admin';
import { isValidNameFormat } from '$lib/server/identifiers/reservedPatterns';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const adminPubkey = locals.user.pubkey;
  if (!isAdmin(adminPubkey)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.toLowerCase() : null;
  const reason = typeof body?.reason === 'string' ? body.reason : null;

  if (!name || !isValidNameFormat(name)) {
    return json({ error: 'invalid_name' }, { status: 400 });
  }
  if (!reason) {
    return json({ error: 'reason_required' }, { status: 400 });
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(identifiers).values({ name, status: 'reserved', ownerPubkey: null });
      await tx.insert(identifierEvents).values({
        identifierName: name,
        eventType: 'reserved',
        actorPubkey: adminPubkey,
        reason
      });
    });
  } catch (error) {
    const pgError = error as { code?: string; constraint_name?: string };
    if (pgError.code === '23505' && pgError.constraint_name === 'identifiers_name_unique') {
      const [existing] = await db
        .select({ status: identifiers.status })
        .from(identifiers)
        .where(eq(identifiers.name, name))
        .limit(1);
      return json(
        { error: existing?.status === 'claimed' ? 'name_claimed' : 'name_already_reserved' },
        { status: 409 }
      );
    }
    throw error;
  }

  return json({ name }, { status: 201 });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/routes/api/admin/reservations/+server.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/api/admin/reservations/+server.ts" "src/routes/api/admin/reservations/+server.test.ts"
git commit -m "feat: add POST /api/admin/reservations"
```

---

### Task 7: `DELETE /api/admin/reservations/[name]`

**Files:**
- Create: `src/routes/api/admin/reservations/[name]/+server.ts`
- Test: `src/routes/api/admin/reservations/[name]/+server.test.ts`

**Interfaces:**
- Consumes: `isAdmin` from Task 2, `identifiers`/`identifierEvents` (`$lib/server/db/schema`), `db`
- Produces: `DELETE: RequestHandler` — `{ok: true}` on 200, 401 unauthenticated, 403 non-admin, 404 if no matching reserved row (including if the name is actually claimed)

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/api/admin/reservations/[name]/+server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { DELETE } from './+server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const TEST_NAME = 'admin-reservation-delete-test';

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

  it('returns 404 when there is no matching reserved row', async () => {
    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(404);
  });

  it('never deletes a claimed row', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: 'f'.repeat(64) });
    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(404);
    const rows = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(rows).toHaveLength(1);
  });

  it('removes a reserved row and writes an audit row', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'reserved', ownerPubkey: null });

    const response = await DELETE(requestEvent(TEST_NAME, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(200);

    const rows = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(rows).toHaveLength(0);

    const [event] = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(event.eventType).toBe('reservation_removed');
    expect(event.actorPubkey).toBe(ADMIN_PUBKEY);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/admin/reservations/[name]/+server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/api/admin/reservations/[name]/+server.ts
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { isAdmin } from '$lib/server/auth/admin';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const adminPubkey = locals.user.pubkey;
  if (!isAdmin(adminPubkey)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const name = params.name!;

  const result = await db
    .delete(identifiers)
    .where(and(eq(identifiers.name, name), eq(identifiers.status, 'reserved')))
    .returning({ name: identifiers.name });

  if (result.length === 0) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  await db.insert(identifierEvents).values({
    identifierName: name,
    eventType: 'reservation_removed',
    actorPubkey: adminPubkey
  });

  return json({ ok: true });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/routes/api/admin/reservations/[name]/+server.test.ts"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/api/admin/reservations/[name]/+server.ts" "src/routes/api/admin/reservations/[name]/+server.test.ts"
git commit -m "feat: add DELETE /api/admin/reservations/[name]"
```

---

### Task 8: `POST /api/admin/force-release`

**Files:**
- Create: `src/routes/api/admin/force-release/+server.ts`
- Test: `src/routes/api/admin/force-release/+server.test.ts`

**Interfaces:**
- Consumes: `isAdmin` from Task 2, `invalidateIdentifier` (`$lib/server/db/identifiers`), `identifiers`/`identifierEvents` (`$lib/server/db/schema`)
- Produces: `POST: RequestHandler` — `{ok: true}` on 200, 400 (missing name/reason), 401 unauthenticated, 403 non-admin, 404 not found, 409 not actually stale

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/api/admin/force-release/+server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { POST } from './+server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const TEST_NAME = 'admin-force-release-test';

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
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, null));
    expect(response.status).toBe(401);
  });

  it('returns 404 when the identifier does not exist', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(404);
  });

  it('returns 400 when reason is missing', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME }, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(400);
  });

  it('returns 409 when the identifier is not actually stale', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: 'a'.repeat(64) });
    const response = await POST(requestEvent({ name: TEST_NAME, reason: 'x' }, { pubkey: ADMIN_PUBKEY }));
    expect(response.status).toBe(409);
  });

  it('force-releases a genuinely stale identifier, with an audit row and cache invalidation', async () => {
    const sevenMonthsAgo = new Date(Date.now() - 7 * 30 * 24 * 60 * 60 * 1000);
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: 'a'.repeat(64),
      lastIdentifiedAt: sevenMonthsAgo
    });
    await valkey.set('identifier:' + TEST_NAME, JSON.stringify({ pubkey: 'a'.repeat(64), relays: [] }), 'EX', 300);

    const response = await POST(
      requestEvent({ name: TEST_NAME, reason: 'reported impersonation' }, { pubkey: ADMIN_PUBKEY })
    );
    expect(response.status).toBe(200);

    const rows = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(rows).toHaveLength(0);

    const [event] = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(event.eventType).toBe('force_released');
    expect(event.reason).toBe('reported impersonation');

    expect(await valkey.get('identifier:' + TEST_NAME)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/admin/force-release/+server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/api/admin/force-release/+server.ts
import { json } from '@sveltejs/kit';
import { and, eq, lt } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { invalidateIdentifier } from '$lib/server/db/identifiers';
import { isAdmin } from '$lib/server/auth/admin';

const STALE_AFTER_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const adminPubkey = locals.user.pubkey;
  if (!isAdmin(adminPubkey)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.toLowerCase() : null;
  const reason = typeof body?.reason === 'string' ? body.reason : null;

  if (!name || !reason) {
    return json({ error: 'invalid_request' }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  const deleted = await db
    .delete(identifiers)
    .where(
      and(eq(identifiers.name, name), eq(identifiers.status, 'claimed'), lt(identifiers.lastIdentifiedAt, cutoff))
    )
    .returning({ name: identifiers.name });

  if (deleted.length === 0) {
    const [current] = await db
      .select({ lastIdentifiedAt: identifiers.lastIdentifiedAt })
      .from(identifiers)
      .where(eq(identifiers.name, name))
      .limit(1);

    if (!current) {
      return json({ error: 'not_found' }, { status: 404 });
    }
    return json(
      { error: `no longer eligible, last verified ${current.lastIdentifiedAt.toISOString()}` },
      { status: 409 }
    );
  }

  await db.insert(identifierEvents).values({
    identifierName: name,
    eventType: 'force_released',
    actorPubkey: adminPubkey,
    reason
  });

  await invalidateIdentifier(name);

  return json({ ok: true });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/routes/api/admin/force-release/+server.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/api/admin/force-release/+server.ts" "src/routes/api/admin/force-release/+server.test.ts"
git commit -m "feat: add POST /api/admin/force-release"
```

---

### Task 9: `/admin` load guard

**Files:**
- Create: `src/routes/admin/+page.server.ts`
- Test: `src/routes/admin/+page.server.test.ts`

**Interfaces:**
- Consumes: `isAdmin` from Task 2, `getStaleIdentifiers`/`getReservations` from Task 5
- Produces: `load: PageServerLoad` returning `{stale: {...}[]; reservations: {...}[]}` — redirects `/login` unauthenticated, `403` non-admin

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/admin/+page.server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const ADMIN_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const NON_ADMIN_PUBKEY = '1'.repeat(64);
const TEST_NAME = 'admin-page-load-test';

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
    const sevenMonthsAgo = new Date(Date.now() - 7 * 30 * 24 * 60 * 60 * 1000);
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: 'a'.repeat(64),
      lastIdentifiedAt: sevenMonthsAgo
    });

    const result = await load(loadEvent({ pubkey: ADMIN_PUBKEY }));
    expect(result.stale.some((s) => s.name === TEST_NAME)).toBe(true);
    expect(Array.isArray(result.reservations)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/routes/admin/+page.server.test.ts`
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

Run: `pnpm vitest run src/routes/admin/+page.server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin/+page.server.ts src/routes/admin/+page.server.test.ts
git commit -m "feat: add /admin load guard"
```

---

### Task 10: `/admin` screen

**Files:**
- Create: `src/routes/admin/+page.svelte`

**Interfaces:**
- Consumes: `CredentialCard` (Claim flow, `$lib/client/CredentialCard.svelte`); the two write endpoints from Tasks 6–8 over `fetch`
- Produces: the `/admin` route. No dedicated Vitest test (thin markup+wiring, verified by Task 11's Playwright test), consistent with prior sub-projects' convention.

- [ ] **Step 1: Write `+page.svelte`**

```svelte
<!-- src/routes/admin/+page.svelte -->
<script lang="ts">
  import CredentialCard from '$lib/client/CredentialCard.svelte';

  let { data } = $props<{
    data: {
      stale: { name: string; ownerPubkey: string | null; lastIdentifiedAt: string }[];
      reservations: { name: string; reason: string | null; actorPubkey: string | null; createdAt: string }[];
    };
  }>();

  let stale = $state(data.stale);
  let reservations = $state(data.reservations);

  let releaseTarget = $state<string | null>(null);
  let releaseReason = $state('');
  let releaseError = $state('');

  let newReservationName = $state('');
  let newReservationReason = $state('');
  let reservationError = $state('');

  function openReleaseModal(name: string) {
    releaseTarget = name;
    releaseReason = '';
    releaseError = '';
  }

  async function confirmForceRelease() {
    if (!releaseTarget || !releaseReason) return;
    const response = await fetch('/api/admin/force-release', {
      method: 'POST',
      body: JSON.stringify({ name: releaseTarget, reason: releaseReason })
    });
    if (response.status === 200) {
      stale = stale.filter((s) => s.name !== releaseTarget);
      releaseTarget = null;
    } else {
      const body = await response.json().catch(() => ({ error: 'unknown_error' }));
      releaseError = body.error;
    }
  }

  async function addReservation() {
    reservationError = '';
    const response = await fetch('/api/admin/reservations', {
      method: 'POST',
      body: JSON.stringify({ name: newReservationName.toLowerCase(), reason: newReservationReason })
    });
    if (response.status === 201) {
      reservations = [
        ...reservations,
        {
          name: newReservationName.toLowerCase(),
          reason: newReservationReason,
          actorPubkey: null,
          createdAt: new Date().toISOString()
        }
      ];
      newReservationName = '';
      newReservationReason = '';
    } else {
      const body = await response.json().catch(() => ({ error: 'unknown_error' }));
      reservationError = body.error;
    }
  }

  async function removeReservation(name: string) {
    const response = await fetch(`/api/admin/reservations/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (response.status === 200) {
      reservations = reservations.filter((r) => r.name !== name);
    }
  }
</script>

<CredentialCard title="Admin">
  <h2>Stale identifiers</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Owner</th><th>Last verified</th><th></th></tr>
    </thead>
    <tbody>
      {#each stale as row}
        <tr>
          <td>{row.name}</td>
          <td>{row.ownerPubkey}</td>
          <td>{new Date(row.lastIdentifiedAt).toLocaleDateString()}</td>
          <td><button onclick={() => openReleaseModal(row.name)}>Force release</button></td>
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
          <td><button onclick={() => removeReservation(row.name)}>Remove</button></td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h3>Add reservation</h3>
  <label for="reservation-name">Name</label>
  <input id="reservation-name" bind:value={newReservationName} />
  <label for="reservation-reason">Reason</label>
  <input id="reservation-reason" bind:value={newReservationReason} />
  <button onclick={addReservation}>Add reservation</button>
  {#if reservationError}
    <p class="error" role="alert">{reservationError}</p>
  {/if}
</CredentialCard>

{#if releaseTarget}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal__content">
      <p>Force-releasing {releaseTarget} makes it available for anyone else to claim. This cannot be undone.</p>
      <label for="release-reason">Reason (required)</label>
      <input id="release-reason" bind:value={releaseReason} />
      <button onclick={confirmForceRelease} disabled={!releaseReason}>Force release {releaseTarget}</button>
      <button onclick={() => (releaseTarget = null)}>Cancel</button>
      {#if releaseError}
        <p class="error" role="alert">{releaseError}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }
  th,
  td {
    border-bottom: 1px solid var(--color-void);
    padding: var(--space-1);
    text-align: left;
  }
  .error {
    color: var(--color-oxblood);
  }
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(26, 42, 74, 0.6);
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

- [ ] **Step 2: Verify the app builds and type-checks**

Run: `pnpm check && pnpm build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin/+page.svelte
git commit -m "feat: add /admin screen"
```

---

### Task 11: Playwright e2e — admin dashboard

**Files:**
- Create: `tests/e2e/helpers/fixedAdminSigner.ts`
- Create: `tests/e2e/admin-dashboard.spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1–10; `finalizeEvent`, `getPublicKey` from `nostr-tools`
- Produces: `installFixedAdminExtension(page: Page): Promise<void>` from `tests/e2e/helpers/fixedAdminSigner.ts`; a new passing e2e test

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
    // @ts-expect-error test-only global bridge
    window.nostr = {
      getPublicKey: () => window.__testGetPublicKey(),
      signEvent: (template: unknown) => window.__testSignEvent(template)
    };
  });
}
```

- [ ] **Step 2: Write the test**

```ts
// tests/e2e/admin-dashboard.spec.ts
import { test, expect } from '@playwright/test';
import { installFixedAdminExtension } from './helpers/fixedAdminSigner';

test('admin can view the report and manage reservations', async ({ page }) => {
  await installFixedAdminExtension(page);

  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with extension' }).click();
  await page.waitForURL('**/claim');

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Stale identifiers' })).toBeVisible();

  const reservationName = 'e2eresadmin' + Date.now();
  await page.getByLabel('Name').fill(reservationName);
  await page.getByLabel('Reason').fill('e2e test reservation');
  await page.getByRole('button', { name: 'Add reservation' }).click();
  await expect(page.getByText(reservationName)).toBeVisible();

  await page
    .getByRole('row', { name: new RegExp(reservationName) })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.getByText(reservationName)).not.toBeVisible();
});
```

- [ ] **Step 3: Run the full e2e suite**

Run: `pnpm test:e2e`
Expected: PASS (4 tests — the prior 3 plus this one). Requires `.env`'s `ADMIN_PUBKEYS` to include `0000000000000000000000000000000000000000000000000000000000000000` (Task 1) and `PUBLIC_ORIGIN` set for the preview port, as in prior plans.

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

- `/admin` — visible only to pubkeys listed in `ADMIN_PUBKEYS`. Two sections: a live report of identifiers unverified for 6+ months (with force-release, reason required), and reservation management (add/remove, reason required on add).
- Admin actions are always audit-logged to `identifier_events` with the acting admin's pubkey.
```

- [ ] **Step 2: Run the full test suite with coverage**

Run: `pnpm test:coverage`
Expected: all tests pass (every prior sub-project's plus this plan's); coverage meets the 90% threshold.

- [ ] **Step 3: Run static checks**

Run: `pnpm check && pnpm lint`
Expected: both succeed with no errors.

- [ ] **Step 4: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS (4 tests), per Task 11.

- [ ] **Step 5: Manual smoke test**

With `docker compose up -d`, migrations run, and `.env`'s `PUBLIC_ORIGIN`/`ADMIN_PUBKEYS` set for `pnpm dev`'s port: run `pnpm dev`, sign in with a NIP-07 extension whose pubkey is in `ADMIN_PUBKEYS`, visit `/admin`, add a reservation, confirm it appears, remove it, and confirm a non-admin pubkey gets a 403 on `/admin`.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document the admin dashboard"
```
