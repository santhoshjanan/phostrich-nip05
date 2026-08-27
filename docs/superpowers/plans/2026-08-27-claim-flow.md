# Claim Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** The Foundation plan (`docs/superpowers/plans/2026-08-27-foundation.md`) and the Auth plan (`docs/superpowers/plans/2026-08-27-auth.md`) must be implemented first. This plan builds on Foundation's schema/db/valkey modules and Auth's session (`locals.user`) and rate-limiting helpers. As with the Auth plan, "Modify" steps show full resulting files rather than line ranges, since those files don't exist on disk yet at the time of writing.

**Goal:** Build the first UI — `/login`, `/claim`, `/claimed` — and the two backend endpoints they call, so an authenticated Nostr user can claim a working NIP-05 identifier end to end.

**Architecture:** Two small backend additions (a name-policy validator, a transactional claim function) sit behind two thin routes, mirroring Foundation's and Auth's layering. Three Svelte pages share one visual shell component and call the routes through small, unit-tested client-side `.ts` modules — the `.svelte` files stay thin (markup + wiring only) and are verified by the plan's Playwright e2e test instead of Vitest, per `docs/SPEC.md`'s existing "don't chase coverage on markup" principle.

**Tech Stack:** SvelteKit 2, Drizzle ORM, `nostr-tools` (client-side signing this time, via `window.nostr` and `nostr-tools/nip46`), `@fontsource/source-serif-4` + `@fontsource/jetbrains-mono` (self-hosted, no third-party font CDN), `happy-dom` (browser-environment Vitest for client modules), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-claim-flow-design.md` (and `docs/SPEC.md`, `PRODUCT.md` for full context)

## Global Constraints

- Privileged logic lives only in `src/lib/server/**`; relative imports inside it (not `$lib`), same as Foundation and Auth.
- Name format: lowercase, `^[a-z0-9._-]+$`, length 2–30, no leading/trailing separator, no consecutive dots.
- Reserved-name blocklist (exact set + one government pattern) as listed in the design doc — implemented in Task 3.
- Availability and claim-conflict responses never reveal *why* a name is unavailable (claimed vs. reserved vs. blocked).
- One claimed identifier per `owner_pubkey`, enforced by a partial unique index, not just an app-level check.
- The expiry-policy modal is a hard interrupt: no outside-click dismiss, requires an explicit affirmative action.
- **Visual direction (Issued Credential), concrete values decided here since the design doc deliberately left them for implementation:**
  - Colors: `--color-navy: #1a2a4a`, `--color-cream: #f5f1e8`, `--color-oxblood: #6b1f2a`, `--color-ink: #2a2620`, `--color-void: #b8b2a5`
  - Display face: Source Serif 4 (`@fontsource/source-serif-4`). Mono face: JetBrains Mono (`@fontsource/jetbrains-mono`). Both self-hosted.
  - Unavailable/void states render struck-through in oxblood, never a generic red icon. Availability reads as a short text label, not a badge.
- `.svelte` files are excluded from the Vitest coverage threshold (Task 7); they're verified functionally by Playwright, not by unit coverage.
- 90% coverage gate applies to everything else, same as Foundation and Auth.
- **E2E environment note:** Playwright's `webServer` runs `pnpm preview` (default port 4173), but `.env`'s `PUBLIC_ORIGIN` from Foundation defaults to `http://localhost:5173` (the `pnpm dev` port). Since the client builds its auth-event `u` tag from `window.location.origin` and the server checks it against `config.PUBLIC_ORIGIN`, these must match exactly or `/auth/verify` will reject every e2e sign-in. Task 13 calls this out explicitly.

---

## File Structure

```
src/lib/server/db/
  schema.ts (modify)              — partial unique index + identifier_events table
  schema.test.ts (modify)
  identifiers.ts (modify)         — invalidateIdentifier(), identifierNameExists()
  identifiers.test.ts (modify)

src/lib/server/identifiers/
  reservedPatterns.ts              — isClaimableName()
  reservedPatterns.test.ts
  claim.ts                          — claimIdentifier()
  claim.test.ts

src/routes/api/identifiers/
  availability/+server.ts, +server.test.ts
  claim/+server.ts, +server.test.ts

src/app.css                        — design tokens
src/app.d.ts (modify)              — window.nostr typing
src/routes/+layout.svelte          — imports app.css
src/lib/client/
  CredentialCard.svelte             — shared shell
  auth.ts, auth.test.ts             — sign-in logic
  claimForm.ts, claimForm.test.ts   — debounce/availability/submit logic

src/routes/login/+page.server.ts, +page.svelte
src/routes/claim/+page.server.ts, +page.server.test.ts, +page.svelte
src/routes/claimed/+page.server.ts, +page.server.test.ts, +page.svelte

vite.config.ts (modify)            — happy-dom for client tests, coverage exclude
playwright.config.ts (modify)      — baseURL
package.json (modify)              — happy-dom, @fontsource/*
tests/e2e/claim-flow.spec.ts
README.md (modify)
```

---

### Task 1: Schema — one-per-owner constraint and audit table

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Modify: `src/lib/server/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `identifierEvents` table and `identifierEventType` enum; a new unique index `identifiers_owner_pubkey_claimed_unique` on `identifiers.ownerPubkey` (partial, `WHERE status = 'claimed'`)

- [ ] **Step 1: Write the failing tests (append to `schema.test.ts`)**

```ts
// add to imports: inArray
import { inArray } from 'drizzle-orm';
// add to imports from './schema': identifierEvents

describe('one identifier per owner', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(inArray(identifiers.name, ['owner-cap-test-1', 'owner-cap-test-2', 'owner-cap-test-3', 'owner-cap-test-4']));
  });

  it('rejects a second claimed row for the same owner_pubkey', async () => {
    const owner = 'f'.repeat(64);
    await db.insert(identifiers).values({ name: 'owner-cap-test-1', status: 'claimed', ownerPubkey: owner });
    await expect(
      db.insert(identifiers).values({ name: 'owner-cap-test-2', status: 'claimed', ownerPubkey: owner })
    ).rejects.toThrow();
  });

  it('allows the same owner_pubkey on a non-claimed row', async () => {
    const owner = 'e'.repeat(64);
    await db.insert(identifiers).values({ name: 'owner-cap-test-3', status: 'claimed', ownerPubkey: owner });
    await db.insert(identifiers).values({ name: 'owner-cap-test-4', status: 'reserved', ownerPubkey: owner });
  });
});

describe('identifier_events', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, 'never-existed'));
  });

  it('inserts a row without requiring the identifier to still exist', async () => {
    await db.insert(identifierEvents).values({
      identifierName: 'never-existed',
      eventType: 'claimed',
      actorPubkey: 'a'.repeat(64)
    });
    const [row] = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, 'never-existed'));
    expect(row.eventType).toBe('claimed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/db/schema.test.ts`
Expected: FAIL — `identifierEvents` is not exported, and the owner-cap insert does not reject.

- [ ] **Step 3: Write the full updated `schema.ts`**

```ts
// src/lib/server/db/schema.ts
import { sql } from 'drizzle-orm';
import { bigserial, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const identifierStatus = pgEnum('identifier_status', ['claimed', 'reserved', 'blocked']);

export const identifiers = pgTable(
  'identifiers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: text('name').notNull(),
    status: identifierStatus('status').notNull().default('claimed'),
    ownerPubkey: text('owner_pubkey'),
    relays: jsonb('relays').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastIdentifiedAt: timestamp('last_identified_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    nameUnique: uniqueIndex('identifiers_name_unique').on(table.name),
    ownerPubkeyClaimedUnique: uniqueIndex('identifiers_owner_pubkey_claimed_unique')
      .on(table.ownerPubkey)
      .where(sql`${table.status} = 'claimed'`)
  })
);

export const identifierEventType = pgEnum('identifier_event_type', ['claimed', 'released', 'force_released']);

export const identifierEvents = pgTable('identifier_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  identifierName: text('identifier_name').notNull(),
  eventType: identifierEventType('event_type').notNull(),
  actorPubkey: text('actor_pubkey').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
```

- [ ] **Step 4: Generate and run the migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: a new `drizzle/0001_*.sql` is created and applied with no errors.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/db/schema.test.ts`
Expected: PASS (4 tests — Foundation's 2 plus these 2 new describe blocks)

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/db/schema.test.ts drizzle/
git commit -m "feat: add one-per-owner constraint and identifier_events table"
```

---

### Task 2: `invalidateIdentifier` and `identifierNameExists`

**Files:**
- Modify: `src/lib/server/db/identifiers.ts`
- Modify: `src/lib/server/db/identifiers.test.ts`

**Interfaces:**
- Consumes: `valkey`, `db`, `identifiers` (already imported in this file from Foundation)
- Produces: `invalidateIdentifier(name: string): Promise<void>`, `identifierNameExists(name: string): Promise<boolean>` added to `src/lib/server/db/identifiers.ts`

- [ ] **Step 1: Write the failing tests (append to `identifiers.test.ts`)**

```ts
// add to imports from './identifiers': invalidateIdentifier, identifierNameExists

describe('invalidateIdentifier', () => {
  const NAME = 'foundation-invalidate-test';

  afterEach(async () => {
    await valkey.del('identifier:' + NAME);
  });

  it('removes a cached entry', async () => {
    await valkey.set('identifier:' + NAME, JSON.stringify({ pubkey: 'a'.repeat(64), relays: [] }), 'EX', 300);
    await invalidateIdentifier(NAME);
    expect(await valkey.get('identifier:' + NAME)).toBeNull();
  });

  it('does not throw when there is nothing cached', async () => {
    await invalidateIdentifier('never-cached-' + Date.now());
  });
});

describe('identifierNameExists', () => {
  const NAME = 'foundation-exists-test';

  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, NAME));
  });

  it('returns true for a row of any status, false when no row exists', async () => {
    await db.insert(identifiers).values({ name: NAME, status: 'reserved', ownerPubkey: null });
    expect(await identifierNameExists(NAME)).toBe(true);
    expect(await identifierNameExists('definitely-not-there-' + Date.now())).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/db/identifiers.test.ts`
Expected: FAIL — `invalidateIdentifier`/`identifierNameExists` are not exported.

- [ ] **Step 3: Add the implementation (append to `identifiers.ts`)**

```ts
export async function invalidateIdentifier(name: string): Promise<void> {
  try {
    await valkey.del(CACHE_PREFIX + name);
  } catch {
    // best-effort; a stale cache entry self-heals via its own TTL
  }
}

export async function identifierNameExists(name: string): Promise<boolean> {
  const [row] = await db
    .select({ id: identifiers.id })
    .from(identifiers)
    .where(eq(identifiers.name, name))
    .limit(1);
  return row !== undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/db/identifiers.test.ts`
Expected: PASS (10 tests — Foundation's 7 plus these 3)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/identifiers.ts src/lib/server/db/identifiers.test.ts
git commit -m "feat: add invalidateIdentifier and identifierNameExists"
```

---

### Task 3: Name policy — format rules and reserved-name blocklist

**Files:**
- Create: `src/lib/server/identifiers/reservedPatterns.ts`
- Test: `src/lib/server/identifiers/reservedPatterns.test.ts`

**Interfaces:**
- Consumes: nothing (pure)
- Produces: `isClaimableName(name: string): boolean` from `src/lib/server/identifiers/reservedPatterns.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/server/identifiers/reservedPatterns.test.ts
import { describe, expect, it } from 'vitest';
import { isClaimableName } from './reservedPatterns';

describe('isClaimableName', () => {
  it('accepts a normal lowercase name', () => {
    expect(isClaimableName('alice')).toBe(true);
  });

  it('rejects names shorter than 2 or longer than 30 characters', () => {
    expect(isClaimableName('a')).toBe(false);
    expect(isClaimableName('a'.repeat(31))).toBe(false);
    expect(isClaimableName('a'.repeat(30))).toBe(true);
  });

  it('rejects uppercase and disallowed characters', () => {
    expect(isClaimableName('Alice')).toBe(false);
    expect(isClaimableName('alice smith')).toBe(false);
    expect(isClaimableName('alice@smith')).toBe(false);
  });

  it('rejects leading/trailing separators and consecutive dots', () => {
    expect(isClaimableName('.alice')).toBe(false);
    expect(isClaimableName('alice.')).toBe(false);
    expect(isClaimableName('-alice')).toBe(false);
    expect(isClaimableName('alice-')).toBe(false);
    expect(isClaimableName('_alice')).toBe(false);
    expect(isClaimableName('alice_')).toBe(false);
    expect(isClaimableName('al..ice')).toBe(false);
  });

  it('rejects exact reserved names', () => {
    expect(isClaimableName('admin')).toBe(false);
    expect(isClaimableName('google')).toBe(false);
    expect(isClaimableName('whitehouse')).toBe(false);
  });

  it('rejects government pattern variants without false-positiving on governor', () => {
    expect(isClaimableName('us-gov')).toBe(false);
    expect(isClaimableName('gov')).toBe(false);
    expect(isClaimableName('governor')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/identifiers/reservedPatterns.test.ts`
Expected: FAIL — `./reservedPatterns` does not exist.

- [ ] **Step 3: Write the implementation**

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

export function isClaimableName(name: string): boolean {
  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) return false;
  if (!NAME_FORMAT.test(name)) return false;
  if (name.startsWith('.') || name.endsWith('.')) return false;
  if (name.startsWith('-') || name.endsWith('-')) return false;
  if (name.startsWith('_') || name.endsWith('_')) return false;
  if (name.includes('..')) return false;
  if (RESERVED_EXACT.has(name)) return false;
  if (RESERVED_PATTERNS.some((pattern) => pattern.test(name))) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/identifiers/reservedPatterns.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/identifiers/reservedPatterns.ts src/lib/server/identifiers/reservedPatterns.test.ts
git commit -m "feat: add name format rules and reserved-name blocklist"
```

---

### Task 4: `claimIdentifier` — the transactional claim

**Files:**
- Create: `src/lib/server/identifiers/claim.ts`
- Test: `src/lib/server/identifiers/claim.test.ts`

**Interfaces:**
- Consumes: `db` (`../db`), `identifiers`, `identifierEvents` (`../db/schema`), `invalidateIdentifier` from Task 2 (`../db/identifiers`), `isClaimableName` from Task 3 (`./reservedPatterns`)
- Produces: `claimIdentifier(name: string, ownerPubkey: string): Promise<ClaimResult>` and `type ClaimResult = { ok: true } | { ok: false; reason: 'invalid_name' | 'name_taken' | 'owner_cap' }` from `src/lib/server/identifiers/claim.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/server/identifiers/claim.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { valkey } from '../valkey';
import { claimIdentifier } from './claim';

const TEST_NAME = 'claim-test-name';
const TEST_OWNER = '1'.repeat(64);

describe('claimIdentifier', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('claims an available name, writes an audit row, and invalidates the cache', async () => {
    await valkey.set('identifier:' + TEST_NAME, '__miss__', 'EX', 30);

    const result = await claimIdentifier(TEST_NAME, TEST_OWNER);
    expect(result).toEqual({ ok: true });

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.ownerPubkey).toBe(TEST_OWNER);

    const [event] = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(event.eventType).toBe('claimed');
    expect(event.actorPubkey).toBe(TEST_OWNER);

    expect(await valkey.get('identifier:' + TEST_NAME)).toBeNull();
  });

  it('rejects an invalid name format without touching the database', async () => {
    const result = await claimIdentifier('Not Valid!', TEST_OWNER);
    expect(result).toEqual({ ok: false, reason: 'invalid_name' });
  });

  it('rejects a name that is already taken', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: '2'.repeat(64) });
    const result = await claimIdentifier(TEST_NAME, TEST_OWNER);
    expect(result).toEqual({ ok: false, reason: 'name_taken' });
  });

  it('rejects a second claim by an owner who already has one', async () => {
    const otherName = 'claim-test-existing';
    await db.insert(identifiers).values({ name: otherName, status: 'claimed', ownerPubkey: TEST_OWNER });

    try {
      const result = await claimIdentifier(TEST_NAME, TEST_OWNER);
      expect(result).toEqual({ ok: false, reason: 'owner_cap' });
    } finally {
      await db.delete(identifiers).where(eq(identifiers.name, otherName));
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/identifiers/claim.test.ts`
Expected: FAIL — `./claim` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/server/identifiers/claim.ts
import { db } from '../db';
import { identifierEvents, identifiers } from '../db/schema';
import { invalidateIdentifier } from '../db/identifiers';
import { isClaimableName } from './reservedPatterns';

export type ClaimResult = { ok: true } | { ok: false; reason: 'invalid_name' | 'name_taken' | 'owner_cap' };

export async function claimIdentifier(name: string, ownerPubkey: string): Promise<ClaimResult> {
  if (!isClaimableName(name)) {
    return { ok: false, reason: 'invalid_name' };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(identifiers).values({ name, status: 'claimed', ownerPubkey });
      await tx.insert(identifierEvents).values({
        identifierName: name,
        eventType: 'claimed',
        actorPubkey: ownerPubkey
      });
    });
  } catch (error) {
    const pgError = error as { code?: string; constraint_name?: string };
    if (pgError.code === '23505' && pgError.constraint_name === 'identifiers_owner_pubkey_claimed_unique') {
      return { ok: false, reason: 'owner_cap' };
    }
    if (pgError.code === '23505' && pgError.constraint_name === 'identifiers_name_unique') {
      return { ok: false, reason: 'name_taken' };
    }
    throw error;
  }

  await invalidateIdentifier(name);
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/identifiers/claim.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/identifiers/claim.ts src/lib/server/identifiers/claim.test.ts
git commit -m "feat: add transactional claimIdentifier"
```

---

### Task 5: `GET /api/identifiers/availability`

**Files:**
- Create: `src/routes/api/identifiers/availability/+server.ts`
- Test: `src/routes/api/identifiers/availability/+server.test.ts`

**Interfaces:**
- Consumes: `isClaimableName` from Task 3 (`$lib/server/identifiers/reservedPatterns`), `identifierNameExists` from Task 2 (`$lib/server/db/identifiers`), `checkRateLimit` from Auth (`$lib/server/auth/rateLimit`)
- Produces: `GET: RequestHandler` — `{available: boolean}`, always 200, 429 on rate limit

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/api/identifiers/availability/+server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { GET } from './+server';

const TEST_IP = '127.0.0.2';
const TEST_NAME = 'availability-test-name';

function requestEvent(name: string, ip = TEST_IP) {
  const url = new URL('https://phostrich.test/api/identifiers/availability');
  url.searchParams.set('name', name);
  return { url, getClientAddress: () => ip } as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/identifiers/availability', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('ratelimit:availability:ip:' + TEST_IP);
  });

  it('returns available: true for an unused, well-formed name', async () => {
    const response = await GET(requestEvent(TEST_NAME));
    expect(await response.json()).toEqual({ available: true });
  });

  it('returns available: false for a name that already has a row, regardless of status', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'reserved', ownerPubkey: null });
    const response = await GET(requestEvent(TEST_NAME));
    expect(await response.json()).toEqual({ available: false });
  });

  it('returns available: false for a malformed name without a 400', async () => {
    const response = await GET(requestEvent('Not Valid!'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false });
  });

  it('returns available: false for a reserved-pattern name with no DB row', async () => {
    const response = await GET(requestEvent('admin'));
    expect(await response.json()).toEqual({ available: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/identifiers/availability/+server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/api/identifiers/availability/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isClaimableName } from '$lib/server/identifiers/reservedPatterns';
import { identifierNameExists } from '$lib/server/db/identifiers';
import { checkRateLimit } from '$lib/server/auth/rateLimit';

const IP_LIMIT = 60;
const WINDOW_SECONDS = 300;

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const ip = getClientAddress();
  const allowed = await checkRateLimit(`ratelimit:availability:ip:${ip}`, IP_LIMIT, WINDOW_SECONDS);
  if (!allowed) {
    return json({ error: 'rate limited' }, { status: 429 });
  }

  const name = (url.searchParams.get('name') ?? '').toLowerCase();

  if (!isClaimableName(name)) {
    return json({ available: false });
  }

  const exists = await identifierNameExists(name);
  return json({ available: !exists });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/routes/api/identifiers/availability/+server.test.ts"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/api/identifiers/availability/+server.ts" "src/routes/api/identifiers/availability/+server.test.ts"
git commit -m "feat: add GET /api/identifiers/availability"
```

---

### Task 6: `POST /api/identifiers/claim`

**Files:**
- Create: `src/routes/api/identifiers/claim/+server.ts`
- Test: `src/routes/api/identifiers/claim/+server.test.ts`

**Interfaces:**
- Consumes: `claimIdentifier` from Task 4 (`$lib/server/identifiers/claim`)
- Produces: `POST: RequestHandler` — `{name}` on 201, 400 on invalid name, 401 unauthenticated, 409 on conflict (`not_available` or `owner_cap`)

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/api/identifiers/claim/+server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { POST } from './+server';

const TEST_NAME = 'claim-route-test-name';
const TEST_OWNER = '3'.repeat(64);

function requestEvent(body: unknown, user: { pubkey: string } | null) {
  return {
    request: new Request('https://phostrich.test/api/identifiers/claim', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/identifiers/claim', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME }, null));
    expect(response.status).toBe(401);
  });

  it('claims the name and returns 201', async () => {
    const response = await POST(requestEvent({ name: TEST_NAME }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ name: TEST_NAME });
  });

  it('returns 409 for a name that is already taken', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: '4'.repeat(64) });
    const response = await POST(requestEvent({ name: TEST_NAME }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'not_available' });
  });

  it('returns 400 for a malformed name', async () => {
    const response = await POST(requestEvent({ name: 'Not Valid!' }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/identifiers/claim/+server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/api/identifiers/claim/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claimIdentifier } from '$lib/server/identifiers/claim';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.toLowerCase() : null;

  if (!name) {
    return json({ error: 'invalid_name' }, { status: 400 });
  }

  const result = await claimIdentifier(name, locals.user.pubkey);

  if (!result.ok) {
    if (result.reason === 'invalid_name') {
      return json({ error: 'invalid_name' }, { status: 400 });
    }
    if (result.reason === 'owner_cap') {
      return json({ error: 'owner_cap' }, { status: 409 });
    }
    return json({ error: 'not_available' }, { status: 409 });
  }

  return json({ name }, { status: 201 });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/routes/api/identifiers/claim/+server.test.ts"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/api/identifiers/claim/+server.ts" "src/routes/api/identifiers/claim/+server.test.ts"
git commit -m "feat: add POST /api/identifiers/claim"
```

---

### Task 7: Frontend tooling and design tokens

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Create: `src/app.css`
- Create: `src/routes/+layout.svelte`
- Create: `src/lib/client/CredentialCard.svelte`

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties (`--color-navy`, `--color-cream`, `--color-oxblood`, `--color-ink`, `--color-void`, `--font-display`, `--font-mono`, `--space-1`..`--space-4`); `CredentialCard` component (props: `title: string`, `children: Snippet`) from `src/lib/client/CredentialCard.svelte`; Vitest configured with `happy-dom` for `src/lib/client/**` and `.svelte` files excluded from coverage

- [ ] **Step 1: Add dependencies to `package.json`**

Add to `devDependencies`: `"happy-dom": "^15.11.0"`
Add to `dependencies`: `"@fontsource/source-serif-4": "^5.1.0"`, `"@fontsource/jetbrains-mono": "^5.1.0"`

Run: `pnpm install`

- [ ] **Step 2: Write the full updated `vite.config.ts`**

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, coverageConfigDefaults } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environmentMatchGlobs: [['src/lib/client/**', 'happy-dom']],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [...coverageConfigDefaults.exclude, '**/*.svelte'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  }
});
```

- [ ] **Step 3: Write `src/app.css`**

```css
@import '@fontsource/source-serif-4/400.css';
@import '@fontsource/source-serif-4/600.css';
@import '@fontsource/jetbrains-mono/400.css';
@import '@fontsource/jetbrains-mono/500.css';

:root {
  --color-navy: #1a2a4a;
  --color-cream: #f5f1e8;
  --color-oxblood: #6b1f2a;
  --color-ink: #2a2620;
  --color-void: #b8b2a5;

  --font-display: 'Source Serif 4', serif;
  --font-mono: 'JetBrains Mono', monospace;

  --space-1: 0.5rem;
  --space-2: 1rem;
  --space-3: 1.5rem;
  --space-4: 2.5rem;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-cream);
  color: var(--color-ink);
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Write `src/routes/+layout.svelte`**

```svelte
<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
```

- [ ] **Step 5: Write `src/lib/client/CredentialCard.svelte`**

```svelte
<script lang="ts">
  let { title, children } = $props<{ title: string; children: import('svelte').Snippet }>();
</script>

<div class="credential-card">
  <div class="credential-card__header">{title}</div>
  <div class="credential-card__body">
    {@render children()}
  </div>
</div>

<style>
  .credential-card {
    max-width: 28rem;
    margin: 4rem auto;
    background: white;
    border: 1px solid var(--color-void);
    padding: var(--space-4);
  }

  .credential-card__header {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.5rem;
    color: var(--color-navy);
    border-bottom: 2px solid var(--color-navy);
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-3);
  }
</style>
```

- [ ] **Step 6: Verify the existing suite still passes and the app builds**

Run: `pnpm vitest run && pnpm build`
Expected: all existing tests still pass (the `happy-dom` scoping and coverage exclude don't affect server-side tests), and the build succeeds with the new layout and CSS in place.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts src/app.css src/routes/+layout.svelte src/lib/client/CredentialCard.svelte
git commit -m "feat: add design tokens and shared credential-card shell"
```

---

### Task 8: Client-side sign-in (`auth.ts`)

**Files:**
- Modify: `src/app.d.ts`
- Create: `src/lib/client/auth.ts`
- Test: `src/lib/client/auth.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan (calls Auth's `/auth/challenge` and `/auth/verify` over `fetch`)
- Produces: `buildAuthEventTemplate(origin: string, challenge: string): EventTemplate`, `signInWithExtension(): Promise<void>`, `signInWithBunker(uri: string): Promise<void>` from `src/lib/client/auth.ts`

- [ ] **Step 1: Write the full updated `src/app.d.ts`**

```ts
declare global {
  namespace App {
    interface Locals {
      user: { pubkey: string } | null;
    }
  }

  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: unknown): Promise<import('nostr-tools').Event>;
    };
  }
}

export {};
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/client/auth.test.ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuthEventTemplate, signInWithBunker, signInWithExtension } from './auth';

describe('buildAuthEventTemplate', () => {
  it('builds a kind 27235 event template with the challenge and origin', () => {
    const template = buildAuthEventTemplate('https://phostrich.test', 'abc123');
    expect(template.kind).toBe(27235);
    expect(template.tags).toEqual([
      ['u', 'https://phostrich.test/auth/verify'],
      ['method', 'POST'],
      ['challenge', 'abc123']
    ]);
    expect(template.content).toBe('');
  });
});

describe('signInWithExtension', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error test cleanup
    delete window.nostr;
  });

  it('throws when no extension is present', async () => {
    await expect(signInWithExtension()).rejects.toThrow('No Nostr extension detected.');
  });

  it('requests a challenge, signs it, and posts it to /auth/verify', async () => {
    const fakeEvent = { id: 'x', kind: 27235, pubkey: 'p'.repeat(64), sig: 's'.repeat(128) };
    // @ts-expect-error test double
    window.nostr = {
      getPublicKey: async () => 'p'.repeat(64),
      signEvent: async () => fakeEvent
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/challenge')) {
        return new Response(JSON.stringify({ challenge: 'the-nonce' }), { status: 200 });
      }
      return new Response(JSON.stringify({ pubkey: 'p'.repeat(64) }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await signInWithExtension();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const verifyCall = fetchMock.mock.calls[1];
    const verifyBody = JSON.parse((verifyCall[1] as RequestInit).body as string);
    expect(verifyBody.event).toEqual(fakeEvent);
  });
});

describe('signInWithBunker', () => {
  it('throws a clear error for an invalid bunker URI', async () => {
    await expect(signInWithBunker('not-a-bunker-uri')).rejects.toThrow(
      'That does not look like a valid bunker connection.'
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/client/auth.test.ts`
Expected: FAIL — `./auth` does not exist.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/client/auth.ts
import { generateSecretKey } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import type { Event, EventTemplate } from 'nostr-tools';

export function buildAuthEventTemplate(origin: string, challenge: string): EventTemplate {
  return {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', `${origin}/auth/verify`],
      ['method', 'POST'],
      ['challenge', challenge]
    ],
    content: ''
  };
}

async function requestChallenge(pubkey: string): Promise<string> {
  const response = await fetch('/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ pubkey })
  });
  if (!response.ok) {
    throw new Error('Could not request a challenge.');
  }
  const body = await response.json();
  return body.challenge as string;
}

async function submitSignedEvent(event: Event): Promise<void> {
  const response = await fetch('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ event })
  });
  if (!response.ok) {
    throw new Error('Authentication failed.');
  }
}

export async function signInWithExtension(): Promise<void> {
  if (!window.nostr) {
    throw new Error('No Nostr extension detected.');
  }
  const pubkey = await window.nostr.getPublicKey();
  const challenge = await requestChallenge(pubkey);
  const template = buildAuthEventTemplate(window.location.origin, challenge);
  const event = await window.nostr.signEvent(template);
  await submitSignedEvent(event);
}

const BUNKER_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), BUNKER_TIMEOUT_MS);
    })
  ]);
}

export async function signInWithBunker(uri: string): Promise<void> {
  const pointer = await parseBunkerInput(uri);
  if (!pointer) {
    throw new Error('That does not look like a valid bunker connection.');
  }

  const clientSecretKey = generateSecretKey();
  const signer = new BunkerSigner(clientSecretKey, pointer);

  await withTimeout(signer.connect(), 'Connection to your signer timed out.');
  const pubkey = await withTimeout(signer.getPublicKey(), 'Connection to your signer timed out.');
  const challenge = await requestChallenge(pubkey);
  const template = buildAuthEventTemplate(window.location.origin, challenge);
  const event = await withTimeout(signer.signEvent(template), 'Connection to your signer timed out.');

  await submitSignedEvent(event);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/client/auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app.d.ts src/lib/client/auth.ts src/lib/client/auth.test.ts
git commit -m "feat: add client-side NIP-07/NIP-46 sign-in"
```

---

### Task 9: `/login` screen

**Files:**
- Create: `src/routes/login/+page.server.ts`
- Create: `src/routes/login/+page.svelte`

**Interfaces:**
- Consumes: `signInWithExtension`, `signInWithBunker` from Task 8 (`$lib/client/auth`), `CredentialCard` from Task 7 (`$lib/client/CredentialCard.svelte`)
- Produces: the `/login` route. No dedicated Vitest test (thin markup+wiring, verified by Task 13's Playwright test), consistent with the coverage exclusion from Task 7.

- [ ] **Step 1: Write `+page.server.ts`**

```ts
// src/routes/login/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    redirect(302, '/claim');
  }
};
```

- [ ] **Step 2: Write `+page.svelte`**

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import { signInWithBunker, signInWithExtension } from '$lib/client/auth';

  let hasExtension = $state(typeof window !== 'undefined' && Boolean(window.nostr));
  let bunkerUri = $state('');
  let status = $state<'idle' | 'connecting' | 'error'>('idle');
  let errorMessage = $state('');

  async function handleExtensionSignIn() {
    status = 'connecting';
    errorMessage = '';
    try {
      await signInWithExtension();
      await goto('/claim');
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : 'Sign-in failed.';
    }
  }

  async function handleBunkerSignIn() {
    status = 'connecting';
    errorMessage = '';
    try {
      await signInWithBunker(bunkerUri);
      await goto('/claim');
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : 'Sign-in failed.';
    }
  }
</script>

<CredentialCard title="Sign in">
  {#if hasExtension}
    <button onclick={handleExtensionSignIn} disabled={status === 'connecting'}>
      {status === 'connecting' ? 'Signing in…' : 'Sign in with extension'}
    </button>
  {:else}
    <label for="bunker-uri">Remote signer connection</label>
    <input id="bunker-uri" bind:value={bunkerUri} placeholder="bunker://…" />
    <button onclick={handleBunkerSignIn} disabled={status === 'connecting'}>
      {status === 'connecting' ? 'Connecting…' : 'Connect'}
    </button>
  {/if}

  {#if status === 'error'}
    <p class="error" role="alert">{errorMessage}</p>
  {/if}
</CredentialCard>

<style>
  .error {
    color: var(--color-oxblood);
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }
</style>
```

- [ ] **Step 3: Verify the app builds and type-checks**

Run: `pnpm check && pnpm build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/routes/login/+page.server.ts src/routes/login/+page.svelte
git commit -m "feat: add /login screen"
```

---

### Task 10: `/claim` load guard

**Files:**
- Create: `src/routes/claim/+page.server.ts`
- Test: `src/routes/claim/+page.server.test.ts`

**Interfaces:**
- Consumes: `db`, `identifiers` (`$lib/server/db`, `$lib/server/db/schema`)
- Produces: `load: PageServerLoad` from `src/routes/claim/+page.server.ts` — redirects to `/login` when unauthenticated, to `/claimed` when the user already owns a claimed identifier

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/claim/+page.server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const TEST_NAME = 'claim-load-test';
const TEST_OWNER = '5'.repeat(64);

function loadEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as unknown as Parameters<typeof load>[0];
}

describe('claim page load', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('redirects to /login when unauthenticated', async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 302, location: '/login' });
  });

  it('redirects to /claimed when the user already owns a claimed identifier', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).rejects.toMatchObject({
      status: 302,
      location: '/claimed'
    });
  });

  it('does not redirect when authenticated with no existing identifier', async () => {
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/routes/claim/+page.server.test.ts`
Expected: FAIL — `./+page.server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/claim/+page.server.ts
import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }

  const [existing] = await db
    .select({ name: identifiers.name })
    .from(identifiers)
    .where(and(eq(identifiers.ownerPubkey, locals.user.pubkey), eq(identifiers.status, 'claimed')))
    .limit(1);

  if (existing) {
    redirect(302, '/claimed');
  }
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/routes/claim/+page.server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/claim/+page.server.ts src/routes/claim/+page.server.test.ts
git commit -m "feat: add /claim load guard"
```

---

### Task 11: `/claim` form

**Files:**
- Create: `src/lib/client/claimForm.ts`
- Test: `src/lib/client/claimForm.test.ts`
- Create: `src/routes/claim/+page.svelte`

**Interfaces:**
- Consumes: `CredentialCard` from Task 7
- Produces: `debounce<Args>(fn, waitMs)`, `checkAvailability(name): Promise<boolean>`, `submitClaim(name): Promise<{ok:true}|{ok:false;error:string}>`, `type AvailabilityState = 'idle'|'checking'|'available'|'unavailable'` from `src/lib/client/claimForm.ts`. The `/claim` route (no dedicated Vitest test for the `.svelte` file — see Task 7).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/client/claimForm.test.ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { checkAvailability, debounce, submitClaim } from './claimForm';

describe('debounce', () => {
  it('only calls the wrapped function once after the wait elapses', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced('a');
    debounced('b');
    debounced('c');
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');

    vi.useRealTimers();
  });
});

describe('checkAvailability', () => {
  it('returns true when the endpoint reports available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ available: true }), { status: 200 }))
    );
    expect(await checkAvailability('alice')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('returns false when the endpoint reports unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 }))
    );
    expect(await checkAvailability('admin')).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('submitClaim', () => {
  it('returns ok: true on 201', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ name: 'alice' }), { status: 201 }))
    );
    expect(await submitClaim('alice')).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  it('returns the server error code on conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'not_available' }), { status: 409 }))
    );
    expect(await submitClaim('alice')).toEqual({ ok: false, error: 'not_available' });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/client/claimForm.test.ts`
Expected: FAIL — `./claimForm` does not exist.

- [ ] **Step 3: Write `claimForm.ts`**

```ts
// src/lib/client/claimForm.ts
export type AvailabilityState = 'idle' | 'checking' | 'available' | 'unavailable';

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

export async function checkAvailability(name: string): Promise<boolean> {
  const response = await fetch(`/api/identifiers/availability?name=${encodeURIComponent(name)}`);
  const body = await response.json();
  return body.available === true;
}

export async function submitClaim(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch('/api/identifiers/claim', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  if (response.status === 201) {
    return { ok: true };
  }
  const body = await response.json().catch(() => ({ error: 'unknown_error' }));
  return { ok: false, error: body.error ?? 'unknown_error' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/client/claimForm.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write `src/routes/claim/+page.svelte`**

```svelte
<!-- src/routes/claim/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import { checkAvailability, debounce, submitClaim, type AvailabilityState } from '$lib/client/claimForm';

  let name = $state('');
  let availability = $state<AvailabilityState>('idle');
  let showModal = $state(false);
  let submitError = $state('');

  const debouncedCheck = debounce(async (value: string) => {
    if (value.length < 2) {
      availability = 'idle';
      return;
    }
    availability = 'checking';
    const available = await checkAvailability(value);
    availability = available ? 'available' : 'unavailable';
  }, 400);

  function handleInput() {
    debouncedCheck(name.toLowerCase());
  }

  function openModal() {
    if (availability === 'available') {
      showModal = true;
    }
  }

  async function confirmClaim() {
    const result = await submitClaim(name.toLowerCase());
    if (result.ok) {
      await goto('/claimed');
    } else if (result.error === 'unauthenticated') {
      await goto('/login');
    } else {
      submitError = result.error;
      showModal = false;
    }
  }
</script>

<CredentialCard title="Claim your identifier">
  <label for="name">Identifier name</label>
  <input id="name" bind:value={name} oninput={handleInput} placeholder="alice" />

  {#if availability === 'checking'}
    <p class="status">checking…</p>
  {:else if availability === 'available'}
    <p class="status status--available">available</p>
  {:else if availability === 'unavailable'}
    <p class="status status--unavailable">not available</p>
  {/if}

  <button onclick={openModal} disabled={availability !== 'available'}>Claim this name</button>

  {#if submitError}
    <p class="error" role="alert">
      {submitError === 'owner_cap' ? 'You already own an identifier.' : 'That name is no longer available.'}
    </p>
  {/if}
</CredentialCard>

{#if showModal}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal__content">
      <p>
        This identifier is automatically freed for someone else to claim after 6 months with no lookup
        activity against it.
      </p>
      <button onclick={confirmClaim}>I understand, claim this name</button>
      <button onclick={() => (showModal = false)}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .status--available {
    color: var(--color-navy);
  }
  .status--unavailable {
    color: var(--color-oxblood);
    text-decoration: line-through;
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

- [ ] **Step 6: Verify the app builds and type-checks**

Run: `pnpm check && pnpm build`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/client/claimForm.ts src/lib/client/claimForm.test.ts src/routes/claim/+page.svelte
git commit -m "feat: add /claim form"
```

---

### Task 12: `/claimed` screen

**Files:**
- Create: `src/routes/claimed/+page.server.ts`
- Test: `src/routes/claimed/+page.server.test.ts`
- Create: `src/routes/claimed/+page.svelte`

**Interfaces:**
- Consumes: `db`, `identifiers` (`$lib/server/db`, `$lib/server/db/schema`), `config` (`$lib/server/config`), `CredentialCard` from Task 7
- Produces: `load: PageServerLoad` returning `{identifier: string}`; the `/claimed` route

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/claimed/+page.server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const TEST_NAME = 'claimed-load-test';
const TEST_OWNER = '6'.repeat(64);

function loadEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as unknown as Parameters<typeof load>[0];
}

describe('claimed page load', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('redirects to /login when unauthenticated', async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 302, location: '/login' });
  });

  it('redirects to /claim when the user owns no claimed identifier', async () => {
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).rejects.toMatchObject({ status: 302, location: '/claim' });
  });

  it('returns the identifier string when the user owns one', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    const result = await load(loadEvent({ pubkey: TEST_OWNER }));
    expect(result.identifier).toContain(TEST_NAME + '@');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/routes/claimed/+page.server.test.ts`
Expected: FAIL — `./+page.server` does not exist.

- [ ] **Step 3: Write `+page.server.ts`**

```ts
// src/routes/claimed/+page.server.ts
import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { config } from '$lib/server/config';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }

  const [existing] = await db
    .select({ name: identifiers.name })
    .from(identifiers)
    .where(and(eq(identifiers.ownerPubkey, locals.user.pubkey), eq(identifiers.status, 'claimed')))
    .limit(1);

  if (!existing) {
    redirect(302, '/claim');
  }

  const origin = new URL(config.PUBLIC_ORIGIN).host;
  return { identifier: `${existing.name}@${origin}` };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/routes/claimed/+page.server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `+page.svelte`**

```svelte
<!-- src/routes/claimed/+page.svelte -->
<script lang="ts">
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  let { data } = $props<{ data: { identifier: string } }>();
  let copied = $state(false);

  async function copy() {
    await navigator.clipboard.writeText(data.identifier);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<CredentialCard title="Identifier issued">
  <p class="identifier">{data.identifier}</p>
  <button onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  <p class="note">Account and relay management are coming in a future update.</p>
</CredentialCard>

<style>
  .identifier {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    color: var(--color-navy);
  }
  .note {
    font-size: 0.875rem;
    color: var(--color-void);
  }
</style>
```

- [ ] **Step 6: Verify the app builds and type-checks**

Run: `pnpm check && pnpm build`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/routes/claimed/+page.server.ts src/routes/claimed/+page.server.test.ts src/routes/claimed/+page.svelte
git commit -m "feat: add /claimed screen"
```

---

### Task 13: Playwright e2e — the full claim flow

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/claim-flow.spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1–12, plus `nostr-tools` directly in the test file
- Produces: the project's first passing e2e test

- [ ] **Step 1: Write the full updated `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:4173'
  },
  webServer: {
    command: 'pnpm preview',
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
});
```

- [ ] **Step 2: Set `.env`'s `PUBLIC_ORIGIN` for e2e**

Playwright's `webServer` runs `pnpm preview`, which serves on port 4173 by default — not `pnpm dev`'s 5173. The client builds its auth-event `u` tag from `window.location.origin`, and the server checks that tag against `config.PUBLIC_ORIGIN` (Auth's design). These must match exactly, or every e2e sign-in will fail `/auth/verify`. Before running e2e, set in `.env`:

```
PUBLIC_ORIGIN=http://localhost:4173
```

(Switch it back to `http://localhost:5173` for `pnpm dev` afterward, or keep two `.env` files — this is a known friction of local dev vs. e2e covered in the plan's Global Constraints, not something this task changes.)

- [ ] **Step 3: Write the test**

```ts
// tests/e2e/claim-flow.spec.ts
import { test, expect } from '@playwright/test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

test('sign in with a fake extension and claim an identifier', async ({ page }) => {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);

  await page.exposeFunction('__testGetPublicKey', () => pubkey);
  await page.exposeFunction('__testSignEvent', (template: unknown) => {
    return finalizeEvent(template as Parameters<typeof finalizeEvent>[0], secretKey);
  });

  await page.addInitScript(() => {
    // @ts-expect-error test-only global bridge
    window.nostr = {
      getPublicKey: () => window.__testGetPublicKey(),
      signEvent: (template: unknown) => window.__testSignEvent(template)
    };
  });

  const claimName = 'e2e' + Date.now();

  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with extension' }).click();
  await page.waitForURL('**/claim');

  await page.getByLabel('Identifier name').fill(claimName);
  await expect(page.getByText('available', { exact: true })).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'Claim this name' }).click();
  await page.getByRole('button', { name: 'I understand, claim this name' }).click();

  await page.waitForURL('**/claimed');
  await expect(page.getByText(claimName, { exact: false })).toBeVisible();
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm test:e2e`
Expected: PASS (1 test). Requires `docker compose up -d`, migrations run (`pnpm db:migrate`), and `.env`'s `PUBLIC_ORIGIN` set as in Step 2.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/claim-flow.spec.ts
git commit -m "test: add first e2e test for the claim flow"
```

---

### Task 14: Full verification and docs

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–13
- Produces: a documented, end-to-end-verified claim flow

- [ ] **Step 1: Update `README.md`**

Add a new section after "Auth":

```markdown
## Claim flow

- `/login` — sign in with a NIP-07 extension or a NIP-46 bunker connection.
- `/claim` — pick an available identifier name; a 6-month inactivity policy is shown before the claim is confirmed.
- `/claimed` — the issued identifier, with a copy button.

New env for e2e only: `PUBLIC_ORIGIN` must match wherever `pnpm preview` actually serves (default `http://localhost:4173`), since the client's signed auth event and the server's check of it both depend on this value matching exactly.
```

- [ ] **Step 2: Run the full test suite with coverage**

Run: `pnpm test:coverage`
Expected: all tests pass (Foundation's, Auth's, and this plan's — roughly 60 total); coverage meets the 90% threshold (`.svelte` files are excluded per Task 7). Add tests for any shortfall rather than lowering the gate.

- [ ] **Step 3: Run static checks**

Run: `pnpm check && pnpm lint`
Expected: both succeed with no errors.

- [ ] **Step 4: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS, per Task 13.

- [ ] **Step 5: Manual smoke test**

With `docker compose up -d`, migrations and seed run, and `.env`'s `PUBLIC_ORIGIN` matching `pnpm dev`'s port (`http://localhost:5173`): run `pnpm dev`, open `/login` in a browser with a NIP-07 extension installed (e.g. Alby or nos2x), sign in, claim a name, and confirm `/claimed` shows it. Note that a real extension is required here — the Playwright test's fake `window.nostr` only exists inside that test's browser context.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document the claim flow"
```
