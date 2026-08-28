# Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** The Foundation, Auth, and Claim-flow plans must be implemented first. This plan builds on Claim flow's `identifiers`/`identifierEvents` schema, `CredentialCard.svelte`, design tokens, and the claim e2e test — and amends one of Claim flow's own files (see Task 7). As with prior plans, "Modify" steps show full resulting files rather than line ranges where the target file doesn't exist yet at time of writing.

**Goal:** Add the persistent `/account` page — relay list editing, release, and inactivity status — completing the loop the Claim flow began.

**Architecture:** `saveOwnedRelays()` and `releaseOwnedIdentifier()` in `src/lib/server/identifiers/account.ts` sit behind two thin routes (`PUT /api/account/relays`, `POST /api/account/release`). Their conditional owner/status mutations and post-commit invalidation preserve the server-layer boundary. The account page reuses the Issued Credential shell and design tokens already built; no new visual world.

**Tech Stack:** SvelteKit 2, Drizzle ORM, Playwright (extending the existing e2e suite).

**Spec:** `docs/superpowers/specs/2026-08-27-account-management-design.md` (and `docs/SPEC.md`, `PRODUCT.md` for full context)

## Global Constraints

- Privileged logic only in `src/lib/server/**`, relative imports inside it — same as every prior sub-project.
- Relay validation: cap 8, `wss://` required (`ws://` allowed only via an explicit `allowInsecure` flag, decided by the route from `$app/environment`'s `dev`, never hardcoded inside the validator), no credentials, no query string, deduped by normalized trailing slash, order preserved.
- Relay-edit validation errors are specific (unlike the deliberately vague claim/availability responses) — this is a user editing their own authenticated data, not a stranger probing the system.
- Relay service: validate first, then conditionally update `owner_pubkey` + `status = 'claimed'` with `RETURNING`; a zero-row result is not found and does not invalidate.
- Release service: conditional owner/status `DELETE ... RETURNING` plus its `released` audit insertion occur in one transaction; a zero-row result writes no audit event; cache invalidation is fail-open after a successful commit.
- Release confirmation: explicit hard-interrupt modal with safe initial focus, Tab/Shift+Tab containment, idle-only Escape, and focus restoration after Cancel, Escape, or a failed release.
- Inactivity status: always show `Last NIP-05 lookup` and `Eligible for release after`, with calm helper copy explaining that public lookups determine eligibility.
- Account client requests are total: network rejections, aborts, and unusable error responses become concise user-safe failures, and save/release busy states always clear. Relay `N` errors attach to their matching fields via `aria-invalid` and `aria-describedby`.
- `/claim`'s already-owns-one redirect changes from `/claimed` to `/account` (Task 7).
- `.svelte` files stay excluded from the Vitest coverage threshold; verified by Playwright instead. 90% coverage gate applies to everything else.

---

## File Structure

```
src/lib/server/identifiers/
  relays.ts, relays.test.ts          — validateRelayList()
  account.ts, account.test.ts        — saveOwnedRelays(), releaseOwnedIdentifier()

src/routes/api/account/
  relays/+server.ts, server.test.ts
  release/+server.ts, server.test.ts

src/routes/account/
  +page.server.ts, page.server.test.ts
  +page.svelte

src/lib/client/
  accountForm.ts, accountForm.test.ts  — saveRelays(), releaseIdentifier(), eligibleForReleaseDate()

src/routes/claim/+page.server.ts (modify)       — redirect target /claimed -> /account
src/routes/claim/page.server.test.ts (modify)

tests/e2e/helpers/fakeSigner.ts                  — extracted from Claim flow's e2e test
tests/e2e/claim-flow.spec.ts (modify)            — use the extracted helper
tests/e2e/account-management.spec.ts

README.md (modify)
```

---

### Task 1: Relay list validator

**Files:**
- Create: `src/lib/server/identifiers/relays.ts`
- Test: `src/lib/server/identifiers/relays.test.ts`

**Interfaces:**
- Consumes: nothing (pure)
- Produces: `validateRelayList(relays: string[], options?: { allowInsecure?: boolean }): RelayValidationResult` and `type RelayValidationResult = { ok: true; relays: string[] } | { ok: false; error: string }` from `src/lib/server/identifiers/relays.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/server/identifiers/relays.test.ts
import { describe, expect, it } from 'vitest';
import { validateRelayList } from './relays';

describe('validateRelayList', () => {
  it('accepts a well-formed wss:// list', () => {
    const result = validateRelayList(['wss://relay.one', 'wss://relay.two']);
    expect(result).toEqual({ ok: true, relays: ['wss://relay.one/', 'wss://relay.two/'] });
  });

  it('rejects more than 8 relays', () => {
    const relays = Array.from({ length: 9 }, (_, i) => `wss://relay${i}.example`);
    const result = validateRelayList(relays);
    expect(result).toEqual({ ok: false, error: 'no more than 8 relays are allowed' });
  });

  it('rejects ws:// by default', () => {
    const result = validateRelayList(['ws://relay.example']);
    expect(result).toEqual({ ok: false, error: 'relay 1: must start with wss://' });
  });

  it('allows ws:// when allowInsecure is true', () => {
    const result = validateRelayList(['ws://relay.example'], { allowInsecure: true });
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed URL', () => {
    const result = validateRelayList(['not-a-url']);
    expect(result).toEqual({ ok: false, error: 'relay 1: not a valid URL' });
  });

  it('rejects credentials in the URL', () => {
    const result = validateRelayList(['wss://user:pass@relay.example']);
    expect(result).toEqual({ ok: false, error: 'relay 1: must not include credentials' });
  });

  it('rejects a query string', () => {
    const result = validateRelayList(['wss://relay.example?x=1']);
    expect(result).toEqual({ ok: false, error: 'relay 1: must not include a query string' });
  });

  it('dedupes by normalized trailing slash, keeping the first occurrence', () => {
    const result = validateRelayList(['wss://relay.example', 'wss://relay.example/']);
    expect(result).toEqual({ ok: true, relays: ['wss://relay.example/'] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/identifiers/relays.test.ts`
Expected: FAIL — `./relays` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/server/identifiers/relays.ts
const MAX_RELAYS = 8;

export type RelayValidationResult = { ok: true; relays: string[] } | { ok: false; error: string };

function normalizeForDedupe(url: string): string {
  return url.replace(/\/+$/, '');
}

export function validateRelayList(
  relays: string[],
  options: { allowInsecure?: boolean } = {}
): RelayValidationResult {
  if (relays.length > MAX_RELAYS) {
    return { ok: false, error: `no more than ${MAX_RELAYS} relays are allowed` };
  }

  const allowedProtocols = options.allowInsecure ? ['wss:', 'ws:'] : ['wss:'];
  const seen = new Set<string>();
  const result: string[] = [];

  for (let i = 0; i < relays.length; i++) {
    let parsed: URL;
    try {
      parsed = new URL(relays[i]);
    } catch {
      return { ok: false, error: `relay ${i + 1}: not a valid URL` };
    }

    if (!allowedProtocols.includes(parsed.protocol)) {
      return { ok: false, error: `relay ${i + 1}: must start with wss://` };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, error: `relay ${i + 1}: must not include credentials` };
    }
    if (parsed.search) {
      return { ok: false, error: `relay ${i + 1}: must not include a query string` };
    }

    const key = normalizeForDedupe(parsed.toString());
    if (!seen.has(key)) {
      seen.add(key);
      result.push(parsed.toString());
    }
  }

  return { ok: true, relays: result };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/identifiers/relays.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/identifiers/relays.ts src/lib/server/identifiers/relays.test.ts
git commit -m "feat: add relay list validator"
```

---

### Task 2: `PUT /api/account/relays`

**Files:**
- Create: `src/routes/api/account/relays/+server.ts`
- Test: `src/routes/api/account/relays/server.test.ts`

**Interfaces:**
- Consumes: `saveOwnedRelays` from `src/lib/server/identifiers/account`, `dev` from `$app/environment`
- Produces: `PUT: RequestHandler` — `{relays}` on 200, 400 on validation failure, 401 unauthenticated, 404 if the caller owns nothing

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/api/account/relays/server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { PUT } from './+server';

const TEST_NAME = 'relays-route-test';
const TEST_OWNER = '7'.repeat(64);

function requestEvent(body: unknown, user: { pubkey: string } | null) {
  return {
    request: new Request('https://phostrich.test/api/account/relays', {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as unknown as Parameters<typeof PUT>[0];
}

describe('PUT /api/account/relays', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await PUT(requestEvent({ relays: [] }, null));
    expect(response.status).toBe(401);
  });

  it('returns 404 when the caller owns no claimed identifier', async () => {
    const response = await PUT(requestEvent({ relays: [] }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(404);
  });

  it('updates the relay list, invalidates the cache, and returns it', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER, relays: [] });
    await valkey.set('identifier:' + TEST_NAME, JSON.stringify({ pubkey: TEST_OWNER, relays: [] }), 'EX', 300);

    const response = await PUT(requestEvent({ relays: ['wss://relay.example'] }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ relays: ['wss://relay.example/'] });

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.relays).toEqual(['wss://relay.example/']);

    expect(await valkey.get('identifier:' + TEST_NAME)).toBeNull();
  });

  it('returns 400 with a specific message for an invalid relay', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    const response = await PUT(requestEvent({ relays: ['not-a-url'] }, { pubkey: TEST_OWNER }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('relay 1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/account/relays/server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/api/account/relays/+server.ts
import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveOwnedRelays } from '$lib/server/identifiers/account';

export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const relays = Array.isArray(body?.relays) ? body.relays : null;
  if (!relays || !relays.every((r: unknown) => typeof r === 'string')) {
    return json({ error: 'invalid_relays' }, { status: 400 });
  }

  const result = await saveOwnedRelays(locals.user.pubkey, relays, { allowInsecure: dev });
  if (!result.ok && result.reason === 'invalid_relays') {
    return json({ error: result.error }, { status: 400 });
  }
  if (!result.ok) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  return json({ relays: result.relays });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/routes/api/account/relays/server.test.ts"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/api/account/relays/+server.ts" "src/routes/api/account/relays/server.test.ts"
git commit -m "feat: add PUT /api/account/relays"
```

---

### Task 3: `POST /api/account/release`

**Files:**
- Create: `src/routes/api/account/release/+server.ts`
- Test: `src/routes/api/account/release/server.test.ts`

**Interfaces:**
- Consumes: `releaseOwnedIdentifier` from `src/lib/server/identifiers/account`
- Produces: `POST: RequestHandler` — `{ok: true}` on 200, 401 unauthenticated, 404 if the caller owns nothing

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/api/account/release/server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifierEvents, identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { POST } from './+server';

const TEST_NAME = 'release-route-test';
const TEST_OWNER = '8'.repeat(64);

function requestEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/account/release', () => {
  afterEach(async () => {
    await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await POST(requestEvent(null));
    expect(response.status).toBe(401);
  });

  it('returns 404 when the caller owns no claimed identifier', async () => {
    const response = await POST(requestEvent({ pubkey: TEST_OWNER }));
    expect(response.status).toBe(404);
  });

  it('deletes the identifier, writes an audit row, and invalidates the cache', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    await valkey.set('identifier:' + TEST_NAME, JSON.stringify({ pubkey: TEST_OWNER, relays: [] }), 'EX', 300);

    const response = await POST(requestEvent({ pubkey: TEST_OWNER }));
    expect(response.status).toBe(200);

    const rows = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(rows).toHaveLength(0);

    const [event] = await db.select().from(identifierEvents).where(eq(identifierEvents.identifierName, TEST_NAME));
    expect(event.eventType).toBe('released');
    expect(event.actorPubkey).toBe(TEST_OWNER);

    expect(await valkey.get('identifier:' + TEST_NAME)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run "src/routes/api/account/release/server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/api/account/release/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { releaseOwnedIdentifier } from '$lib/server/identifiers/account';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const result = await releaseOwnedIdentifier(locals.user.pubkey);
  if (!result.ok) return json({ error: 'not_found' }, { status: 404 });

  return json({ ok: true });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/routes/api/account/release/server.test.ts"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/api/account/release/+server.ts" "src/routes/api/account/release/server.test.ts"
git commit -m "feat: add POST /api/account/release"
```

---

### Task 4: `/account` load guard

**Files:**
- Create: `src/routes/account/+page.server.ts`
- Test: `src/routes/account/page.server.test.ts`

**Interfaces:**
- Consumes: `db`, `identifiers` (`$lib/server/db`, `$lib/server/db/schema`)
- Produces: `load: PageServerLoad` returning `{name: string; relays: string[]; lastIdentifiedAt: string}` from `src/routes/account/+page.server.ts` — redirects to `/login` unauthenticated, `/claim` if nothing owned

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/account/page.server.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { load } from './+page.server';

const TEST_NAME = 'account-load-test';
const TEST_OWNER = '9'.repeat(64);

function loadEvent(user: { pubkey: string } | null) {
  return { locals: { user } } as unknown as Parameters<typeof load>[0];
}

describe('account page load', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('redirects to /login when unauthenticated', async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 302, location: '/login' });
  });

  it('redirects to /claim when the user owns no claimed identifier', async () => {
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).rejects.toMatchObject({ status: 302, location: '/claim' });
  });

  it('returns the identifier, relays, and lastIdentifiedAt when owned', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_OWNER,
      relays: ['wss://relay.example']
    });

    const result = await load(loadEvent({ pubkey: TEST_OWNER }));
    expect(result.name).toBe(TEST_NAME);
    expect(result.relays).toEqual(['wss://relay.example']);
    expect(typeof result.lastIdentifiedAt).toBe('string');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/routes/account/page.server.test.ts`
Expected: FAIL — `./+page.server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/account/+page.server.ts
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
    .select({
      name: identifiers.name,
      relays: identifiers.relays,
      lastIdentifiedAt: identifiers.lastIdentifiedAt
    })
    .from(identifiers)
    .where(and(eq(identifiers.ownerPubkey, locals.user.pubkey), eq(identifiers.status, 'claimed')))
    .limit(1);

  if (!existing) {
    redirect(302, '/claim');
  }

  return {
    name: existing.name,
    relays: existing.relays,
    lastIdentifiedAt: existing.lastIdentifiedAt.toISOString()
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/routes/account/page.server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/account/+page.server.ts src/routes/account/page.server.test.ts
git commit -m "feat: add /account load guard"
```

---

### Task 5: Client account-form logic

**Files:**
- Create: `src/lib/client/accountForm.ts`
- Test: `src/lib/client/accountForm.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan (calls the routes from Tasks 2–3 over `fetch`)
- Produces: `saveRelays(relays: string[]): Promise<{ok:true; relays:string[]}|{ok:false; error:string}>`, `releaseIdentifier(): Promise<{ok:true}|{ok:false; error:string}>`, `eligibleForReleaseDate(lastIdentifiedAtIso: string): Date` from `src/lib/client/accountForm.ts`

**Stabilization correction:** both request helpers are total: wrap fetch and error-body decoding so rejected, aborted, and unusable responses return concise user-safe failure results. Callers use `finally`-style cleanup so busy state cannot stick.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/client/accountForm.test.ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { eligibleForReleaseDate, releaseIdentifier, saveRelays } from './accountForm';

describe('eligibleForReleaseDate', () => {
  it('adds 6 months to the given date', () => {
    const result = eligibleForReleaseDate('2026-01-15T00:00:00.000Z');
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(6); // July, 0-indexed
    expect(result.getUTCDate()).toBe(15);
  });
});

describe('saveRelays', () => {
  it('returns ok: true with the saved relays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ relays: ['wss://relay.example/'] }), { status: 200 }))
    );
    expect(await saveRelays(['wss://relay.example'])).toEqual({ ok: true, relays: ['wss://relay.example/'] });
    vi.unstubAllGlobals();
  });

  it('returns the server error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'relay 1: not a valid URL' }), { status: 400 }))
    );
    expect(await saveRelays(['bad'])).toEqual({ ok: false, error: 'relay 1: not a valid URL' });
    vi.unstubAllGlobals();
  });
});

describe('releaseIdentifier', () => {
  it('returns ok: true on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    expect(await releaseIdentifier()).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/client/accountForm.test.ts`
Expected: FAIL — `./accountForm` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/client/accountForm.ts
export async function saveRelays(
  relays: string[]
): Promise<{ ok: true; relays: string[] } | { ok: false; error: string }> {
  const response = await fetch('/api/account/relays', {
    method: 'PUT',
    body: JSON.stringify({ relays })
  });
  const body = await response.json().catch(() => ({ error: 'unknown_error' }));
  if (response.status === 200) {
    return { ok: true, relays: body.relays };
  }
  return { ok: false, error: body.error ?? 'unknown_error' };
}

export async function releaseIdentifier(): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch('/api/account/release', { method: 'POST' });
  if (response.status === 200) {
    return { ok: true };
  }
  const body = await response.json().catch(() => ({ error: 'unknown_error' }));
  return { ok: false, error: body.error ?? 'unknown_error' };
}

export function eligibleForReleaseDate(lastIdentifiedAtIso: string): Date {
  const date = new Date(lastIdentifiedAtIso);
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 6,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    )
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/client/accountForm.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/accountForm.ts src/lib/client/accountForm.test.ts
git commit -m "feat: add client-side account form logic"
```

---

### Task 6: `/account` screen

**Files:**
- Create: `src/routes/account/+page.svelte`

**Interfaces:**
- Consumes: `CredentialCard` (Claim flow, `$lib/client/CredentialCard.svelte`), `saveRelays`, `releaseIdentifier`, `eligibleForReleaseDate` from Task 5
- Produces: the `/account` route. No dedicated Vitest test (thin markup+wiring, verified by Task 8's Playwright test), consistent with prior sub-projects' convention.

- [ ] **Step 1: Write `+page.svelte`**

```svelte
<!-- src/routes/account/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import { eligibleForReleaseDate, releaseIdentifier, saveRelays } from '$lib/client/accountForm';

  let { data } = $props<{ data: { name: string; relays: string[]; lastIdentifiedAt: string } }>();

  let relays = $state<string[]>([...data.relays]);
  let saveError = $state('');
  let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
  let showReleaseModal = $state(false);

  const eligibleDate = eligibleForReleaseDate(data.lastIdentifiedAt);

  function addRelay() {
    if (relays.length < 8) relays = [...relays, ''];
  }

  function removeRelay(index: number) {
    relays = relays.filter((_, i) => i !== index);
  }

  async function save() {
    saveStatus = 'saving';
    saveError = '';
    const result = await saveRelays(relays.filter((r) => r.trim().length > 0));
    if (result.ok) {
      relays = result.relays;
      saveStatus = 'saved';
    } else {
      saveError = result.error;
      saveStatus = 'idle';
    }
  }

  async function confirmRelease() {
    const result = await releaseIdentifier();
    if (result.ok) {
      await goto('/claim');
    }
  }
</script>

<CredentialCard title={data.name}>
  <p class="status">Last NIP-05 lookup: {new Date(data.lastIdentifiedAt).toLocaleDateString()}</p>
  <p class="helper">Public NIP-05 lookups determine release eligibility.</p>
  <p class="status">Eligible for release after: {eligibleDate.toLocaleDateString()}</p>

  <h2>Relays</h2>
  {#each relays as relay, index}
    <div class="relay-row">
      <input bind:value={relays[index]} placeholder="wss://…" />
      <button onclick={() => removeRelay(index)}>Remove</button>
    </div>
  {/each}
  {#if relays.length < 8}
    <button onclick={addRelay}>Add relay</button>
  {/if}
  <button onclick={save} disabled={saveStatus === 'saving'}>
    {saveStatus === 'saving' ? 'Saving…' : 'Save relays'}
  </button>
  {#if saveError}
    <p class="error" role="alert">{saveError}</p>
  {/if}

  <button onclick={() => (showReleaseModal = true)}>Release this identifier</button>
</CredentialCard>

{#if showReleaseModal}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal__content">
      <p>Releasing {data.name} makes it available for anyone else to claim. This cannot be undone.</p>
      <button onclick={confirmRelease}>Release {data.name}</button>
      <button onclick={() => (showReleaseModal = false)}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .status {
    font-family: var(--font-ui);
    font-size: 0.875rem;
    color: var(--color-ink);
  }
  .error {
    color: var(--color-accent-rose-text);
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
git add src/routes/account/+page.svelte
git commit -m "feat: add /account screen"
```

---

### Task 7: Amend Claim flow's redirect target

**Files:**
- Modify: `src/routes/claim/+page.server.ts`
- Modify: `src/routes/claim/page.server.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `/claim`'s already-owns-one branch now redirects to `/account` instead of `/claimed`

- [ ] **Step 1: Update the test's expectation**

```ts
// src/routes/claim/page.server.test.ts (full file)
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

  it('redirects to /account when the user already owns a claimed identifier', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: TEST_OWNER });
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).rejects.toMatchObject({
      status: 302,
      location: '/account'
    });
  });

  it('does not redirect when authenticated with no existing identifier', async () => {
    await expect(load(loadEvent({ pubkey: TEST_OWNER }))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/routes/claim/page.server.test.ts`
Expected: FAIL — the redirect still points at `/claimed`.

- [ ] **Step 3: Update the implementation**

```ts
// src/routes/claim/+page.server.ts (full file)
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
    redirect(302, '/account');
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/routes/claim/page.server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/claim/+page.server.ts src/routes/claim/page.server.test.ts
git commit -m "fix: redirect existing owners from /claim to /account"
```

---

### Task 8: Playwright e2e — relay editing and release

**Files:**
- Create: `tests/e2e/helpers/fakeSigner.ts` (extracted from Claim flow's e2e test)
- Modify: `tests/e2e/claim-flow.spec.ts`
- Create: `tests/e2e/account-management.spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1–7 and Claim flow's e2e sign-in pattern
- Produces: `installFakeNostrExtension(page: Page): Promise<string>`, `signInAndClaim(page: Page, claimName: string): Promise<void>` from `tests/e2e/helpers/fakeSigner.ts`; a new passing e2e test

- [ ] **Step 1: Write `tests/e2e/helpers/fakeSigner.ts`**

```ts
// tests/e2e/helpers/fakeSigner.ts
import type { Page } from '@playwright/test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

export async function installFakeNostrExtension(page: Page): Promise<string> {
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

  return pubkey;
}

export async function signInAndClaim(page: Page, claimName: string): Promise<void> {
  await installFakeNostrExtension(page);

  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with extension' }).click();
  await page.waitForURL('**/claim');

  await page.getByLabel('Identifier name').fill(claimName);
  await page.getByText('available', { exact: true }).waitFor({ timeout: 5000 });

  await page.getByRole('button', { name: 'Claim this name' }).click();
  await page.getByRole('button', { name: 'I understand, claim this name' }).click();
  await page.waitForURL('**/claimed');
}
```

- [ ] **Step 2: Update `tests/e2e/claim-flow.spec.ts` to use the helper**

```ts
// tests/e2e/claim-flow.spec.ts (full file)
import { test, expect } from '@playwright/test';
import { signInAndClaim } from './helpers/fakeSigner';

test('sign in with a fake extension and claim an identifier', async ({ page }) => {
  const claimName = 'e2e' + Date.now();
  await signInAndClaim(page, claimName);
  await expect(page.getByText(claimName, { exact: false })).toBeVisible();
});
```

- [ ] **Step 3: Run the existing e2e test to confirm the refactor didn't break it**

Run: `pnpm test:e2e`
Expected: PASS (1 test) — same outcome as before, now via the shared helper.

- [ ] **Step 4: Write the new test**

```ts
// tests/e2e/account-management.spec.ts
import { test, expect } from '@playwright/test';
import { signInAndClaim } from './helpers/fakeSigner';

test('edit relays and release the identifier', async ({ page }) => {
  const claimName = 'e2eacct' + Date.now();
  await signInAndClaim(page, claimName);

  await page.goto('/account');
  await page.getByRole('button', { name: 'Add relay' }).click();
  await page.getByPlaceholder('wss://…').fill('wss://relay.e2e-test.example');
  await page.getByRole('button', { name: 'Save relays' }).click();
  await expect(page.getByRole('button', { name: 'Save relays' })).toBeEnabled();

  await page.getByRole('button', { name: 'Release this identifier' }).click();
  await page.getByRole('button', { name: `Release ${claimName}` }).click();

  await page.waitForURL('**/claim');
});
```

- [ ] **Step 5: Run the full e2e suite**

Run: `pnpm test:e2e`
Expected: PASS (2 tests). Requires `docker compose up -d`, migrations run, and `.env`'s `PUBLIC_ORIGIN` set for the preview port (`http://localhost:4173`), same as Claim flow's Task 13.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/helpers/fakeSigner.ts tests/e2e/claim-flow.spec.ts tests/e2e/account-management.spec.ts
git commit -m "test: add e2e coverage for relay editing and release"
```

---

### Task 9: Full verification and docs

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–8
- Produces: a documented, end-to-end-verified account management sub-project

- [ ] **Step 1: Update `README.md`**

Add a new section after "Claim flow":

```markdown
## Account management

- `/account` — view your identifier, edit its relay list (up to 8, `wss://` only outside dev), see when it was last verified and when it becomes eligible for release, and release it.
- Releasing an identifier is immediate and irreversible; it can be claimed by anyone afterward.
```

- [ ] **Step 2: Run the full test suite with coverage**

Run: `pnpm test:coverage`
Expected: all tests pass (Foundation's, Auth's, Claim flow's, and this plan's); coverage meets the 90% threshold.

- [ ] **Step 3: Run format, static checks, and a production build**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm build`
Expected: all succeed with no errors.

- [ ] **Step 4: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: zero failures from the discovered suite.

- [ ] **Step 5: Manual smoke test**

With `docker compose up -d`, migrations run, and `.env`'s `PUBLIC_ORIGIN` matching `pnpm dev`'s port: run `pnpm dev`, sign in with a real NIP-07 extension, claim a name, go to `/account`, add a relay and save, confirm it's shown after a page reload, then release and confirm you land back on `/claim`.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document account management"
```
