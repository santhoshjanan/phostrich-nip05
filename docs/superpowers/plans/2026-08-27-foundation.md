# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the SvelteKit project, the `identifiers` data model, and the public NIP-05 read endpoint, so the platform can serve `GET /.well-known/nostr.json?name=X` from seeded data — with no auth and no claim flow yet.

**Architecture:** A thin SvelteKit route calls a small server-only repository (`resolveIdentifier`) that implements a Valkey read-through cache in front of a single Postgres `identifiers` table, with negative caching for misses and fail-open behavior if Valkey is unreachable. A seed script stands in for the not-yet-built claim flow.

**Tech Stack:** SvelteKit 2 / Svelte 5, TypeScript strict, `@sveltejs/adapter-node`, Drizzle ORM (`postgres-js` driver) + `drizzle-kit`, `ioredis`, Zod, Vitest, `tsx` for standalone scripts.

**Spec:** `docs/superpowers/specs/2026-08-27-foundation-design.md` (and `docs/SPEC.md` for full product context)

## Global Constraints

- Privileged logic lives only in `src/lib/server/**`; nothing there is importable from client code.
- Store and compare pubkeys as 32-byte lowercase hex everywhere.
- Config is env vars validated by Zod at startup, not YAML — see design doc rationale.
- Integration tests run against real Postgres and Valkey (via `docker compose`), never mocks.
- The NIP-05 endpoint: `Access-Control-Allow-Origin: *`, never redirects, names are case-insensitive, unknown/invalid names return 200 `{"names":{}}` (never 404/400).
- 90% coverage is a build gate.
- No UI/Svelte pages in this plan — the first screen (and first Impeccable invocation) is sub-project 3.
- Files under `src/lib/server/**` use relative imports internally (not the `$lib` alias), because `scripts/seed.ts` and `scripts/migrate.ts` run via `tsx` outside Vite and can't resolve SvelteKit aliases. Route files (`+server.ts`) always run through Vite, so they use `$lib` freely.

---

## File Structure

```
package.json, tsconfig.json, svelte.config.js, vite.config.ts, eslint.config.js,
.prettierrc, playwright.config.ts, drizzle.config.ts, docker-compose.yml,
.env.example, .gitignore, src/app.html, README.md, vitest-setup.ts

src/lib/server/
  config.ts            — Zod-validated env
  config.test.ts
  valkey.ts             — ioredis singleton
  valkey.test.ts
  db/
    schema.ts           — `identifiers` table
    schema.test.ts
    index.ts             — Drizzle client
    identifiers.ts       — resolveIdentifier()
    identifiers.test.ts

scripts/
  migrate.ts
  seed.ts
  seed.test.ts

src/routes/
  .well-known/nostr.json/+server.ts
  .well-known/nostr.json/+server.test.ts
  healthz/+server.ts
  healthz/+server.test.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `svelte.config.js`, `vite.config.ts`, `eslint.config.js`, `.prettierrc`, `playwright.config.ts`, `.gitignore`, `src/app.html`, `vitest-setup.ts`, `tests/e2e/.gitkeep`

**Interfaces:**
- Consumes: nothing
- Produces: a buildable, type-checked, lintable SvelteKit skeleton with Vitest wired for 90% coverage and Playwright configured (unused until sub-project 3)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "phostrich-nip05",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest",
    "test:unit": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed.ts"
  },
  "devDependencies": {
    "@eslint/js": "^9.12.0",
    "@playwright/test": "^1.48.0",
    "@sveltejs/adapter-node": "^5.2.0",
    "@sveltejs/kit": "^2.7.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@vitest/coverage-v8": "^2.1.0",
    "drizzle-kit": "^0.26.0",
    "dotenv": "^16.4.5",
    "eslint": "^9.12.0",
    "eslint-plugin-svelte": "^2.44.0",
    "prettier": "^3.3.3",
    "prettier-plugin-svelte": "^3.2.7",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.8.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "drizzle-orm": "^0.35.0",
    "ioredis": "^5.4.1",
    "postgres": "^3.4.4",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Write `svelte.config.js`**

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};
```

- [ ] **Step 4: Write `vitest-setup.ts`**

```ts
import 'dotenv/config';
```

- [ ] **Step 5: Write `vite.config.ts`**

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
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

- [ ] **Step 6: Write `eslint.config.js`**

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    ignores: ['build/', '.svelte-kit/', 'dist/', 'drizzle/']
  }
];
```

- [ ] **Step 7: Write `.prettierrc`**

```json
{
  "useTabs": false,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

- [ ] **Step 8: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'pnpm preview',
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
});
```

Create an empty `tests/e2e/.gitkeep` so the directory exists (no tests until sub-project 3).

- [ ] **Step 9: Write `.gitignore`**

```
node_modules/
.svelte-kit/
build/
dist/
coverage/
playwright-report/
test-results/
.env
```

- [ ] **Step 10: Write `src/app.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 11: Install and verify**

Run: `pnpm install && pnpm check && pnpm build && pnpm lint`
Expected: all four succeed with no errors (no routes exist yet, so the build produces an app with zero pages — that's expected).

- [ ] **Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json svelte.config.js vite.config.ts \
  eslint.config.js .prettierrc playwright.config.ts .gitignore src/app.html \
  vitest-setup.ts tests/e2e/.gitkeep
git commit -m "chore: scaffold SvelteKit project"
```

---

### Task 2: Dev infrastructure (docker-compose) and `.env`

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env` (untracked)

**Interfaces:**
- Consumes: nothing
- Produces: a running Postgres on `localhost:5432` and Valkey on `localhost:6379` for local dev/test, and the env values later tasks' config/tests read

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: phostrich
      POSTGRES_PASSWORD: phostrich
      POSTGRES_DB: phostrich
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:8-alpine
    ports:
      - '6379:6379'

volumes:
  postgres-data:
```

- [ ] **Step 2: Write `.env.example`**

```
DATABASE_URL=postgres://phostrich:phostrich@localhost:5432/phostrich
VALKEY_URL=redis://localhost:6379
PUBLIC_ORIGIN=http://localhost:5173
DEFAULT_RELAYS=wss://relay.damus.io,wss://relay.primal.net
```

- [ ] **Step 3: Create your local `.env`**

Run: `cp .env.example .env`
(`.env` is gitignored; every later task's tests read real values from it via `vitest-setup.ts`'s `dotenv/config`.)

- [ ] **Step 4: Start and verify infrastructure**

Run: `docker compose up -d && docker compose ps`
Expected: both `postgres` and `valkey` show state `running` (or `healthy`).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add dev docker-compose (postgres, valkey)"
```

---

### Task 3: Config module

**Files:**
- Create: `src/lib/server/config.ts`
- Test: `src/lib/server/config.test.ts`

**Interfaces:**
- Consumes: `process.env` (via `dotenv/config`, loaded by `vitest-setup.ts` in tests; loaded by Vite automatically in the app)
- Produces: `config: { DATABASE_URL: string; VALKEY_URL: string; PUBLIC_ORIGIN: string; DEFAULT_RELAYS: string[] }` from `src/lib/server/config.ts`, and type `Config`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/server/config.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REQUIRED_ENV = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/phostrich',
  VALKEY_URL: 'redis://localhost:6379',
  PUBLIC_ORIGIN: 'https://phostrich.com'
};

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('parses valid env into typed config', async () => {
    Object.assign(process.env, REQUIRED_ENV, {
      DEFAULT_RELAYS: 'wss://relay.one,wss://relay.two'
    });
    const { config } = await import('./config?t=' + Date.now());
    expect(config.DATABASE_URL).toBe(REQUIRED_ENV.DATABASE_URL);
    expect(config.DEFAULT_RELAYS).toEqual(['wss://relay.one', 'wss://relay.two']);
  });

  it('defaults DEFAULT_RELAYS to an empty array when unset', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.DEFAULT_RELAYS;
    const { config } = await import('./config?t=' + Date.now());
    expect(config.DEFAULT_RELAYS).toEqual([]);
  });

  it('throws when DATABASE_URL is missing', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.DATABASE_URL;
    await expect(import('./config?t=' + Date.now())).rejects.toThrow();
  });

  it('throws when PUBLIC_ORIGIN is not a valid URL', async () => {
    Object.assign(process.env, REQUIRED_ENV, { PUBLIC_ORIGIN: 'not-a-url' });
    await expect(import('./config?t=' + Date.now())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/config.test.ts`
Expected: FAIL — `./config` does not exist.

- [ ] **Step 3: Write the implementation**

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
    .pipe(z.array(z.string().url()))
});

export type Config = z.infer<typeof envSchema>;
export const config: Config = envSchema.parse(process.env);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/config.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/config.ts src/lib/server/config.test.ts
git commit -m "feat: add Zod-validated env config"
```

---

### Task 4: Valkey client

**Files:**
- Create: `src/lib/server/valkey.ts`
- Test: `src/lib/server/valkey.test.ts`

**Interfaces:**
- Consumes: `config.VALKEY_URL` from Task 3 (`./config`)
- Produces: `valkey: Redis` (an `ioredis` instance) from `src/lib/server/valkey.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/valkey.test.ts
import { afterAll, describe, expect, it } from 'vitest';
import { valkey } from './valkey';

describe('valkey client', () => {
  afterAll(async () => {
    await valkey.quit();
  });

  it('can set and get a value against the real Valkey instance', async () => {
    await valkey.set('foundation:smoke-test', 'ok', 'EX', 5);
    const value = await valkey.get('foundation:smoke-test');
    expect(value).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/server/valkey.test.ts`
Expected: FAIL — `./valkey` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/server/valkey.ts
import Redis from 'ioredis';
import { config } from './config';

export const valkey = new Redis(config.VALKEY_URL);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/server/valkey.test.ts`
Expected: PASS (requires `docker compose up -d` from Task 2 and `.env` present)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/valkey.ts src/lib/server/valkey.test.ts
git commit -m "feat: add Valkey client"
```

---

### Task 5: Drizzle schema and client

**Files:**
- Create: `src/lib/server/db/schema.ts`, `src/lib/server/db/index.ts`, `drizzle.config.ts`, `scripts/migrate.ts`
- Test: `src/lib/server/db/schema.test.ts`

**Interfaces:**
- Consumes: `config.DATABASE_URL` from Task 3 (`../config`)
- Produces:
  - `identifiers` table and `identifierStatus` enum from `src/lib/server/db/schema.ts`
  - `db` (a configured Drizzle instance) from `src/lib/server/db/index.ts`

- [ ] **Step 1: Write the schema**

```ts
// src/lib/server/db/schema.ts
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
    nameUnique: uniqueIndex('identifiers_name_unique').on(table.name)
  })
);
```

- [ ] **Step 2: Write the Drizzle client**

```ts
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

const client = postgres(config.DATABASE_URL);
export const db = drizzle(client, { schema });
```

- [ ] **Step 3: Write `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
```

- [ ] **Step 4: Write `scripts/migrate.ts`**

```ts
import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '../src/lib/server/db';

async function main() {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Generate and run the migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: `drizzle/0000_*.sql` is created, and `Migrations applied.` prints with no errors.

- [ ] **Step 6: Write the failing smoke test**

```ts
// src/lib/server/db/schema.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { identifiers } from './schema';

const TEST_NAME = 'foundation-schema-smoke-test';

describe('identifiers schema', () => {
  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
  });

  it('inserts and reads back a row matching the migrated table shape', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: 'a'.repeat(64),
      relays: ['wss://relay.example']
    });

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.status).toBe('claimed');
    expect(row.ownerPubkey).toBe('a'.repeat(64));
    expect(row.relays).toEqual(['wss://relay.example']);
  });

  it('rejects a second row with the same name', async () => {
    await db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: 'a'.repeat(64) });
    await expect(
      db.insert(identifiers).values({ name: TEST_NAME, status: 'claimed', ownerPubkey: 'b'.repeat(64) })
    ).rejects.toThrow();
  });
});
```

This test can only be written after the migration exists, so there's no separate "run to see it fail" step for a missing module here — instead, verify it fails before the migration and passes after by running it now, once, after Step 5's migration already ran.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run src/lib/server/db/schema.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/db/index.ts src/lib/server/db/schema.test.ts \
  drizzle.config.ts scripts/migrate.ts drizzle/
git commit -m "feat: add identifiers schema, migration, and Drizzle client"
```

---

### Task 6: Identifier resolution repository

**Files:**
- Create: `src/lib/server/db/identifiers.ts`
- Test: `src/lib/server/db/identifiers.test.ts`

**Interfaces:**
- Consumes: `db`, `identifiers` from Task 5 (`./index`, `./schema`); `valkey` from Task 4 (`../valkey`)
- Produces: `resolveIdentifier(name: string): Promise<ResolvedIdentifier | null>` and `type ResolvedIdentifier = { pubkey: string; relays: string[] }` from `src/lib/server/db/identifiers.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/server/db/identifiers.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { identifiers } from './schema';
import { valkey } from '../valkey';
import { resolveIdentifier } from './identifiers';

const TEST_NAME = 'foundation-resolve-test';
const TEST_PUBKEY = 'd'.repeat(64);

describe('resolveIdentifier', () => {
  beforeEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('returns null when the name does not exist', async () => {
    const result = await resolveIdentifier(TEST_NAME);
    expect(result).toBeNull();
  });

  it('negative-caches a miss so the marker is stored', async () => {
    await resolveIdentifier(TEST_NAME);
    const cached = await valkey.get('identifier:' + TEST_NAME);
    expect(cached).toBe('__miss__');
  });

  it('resolves a claimed identifier from Postgres and populates the cache', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: ['wss://relay.example']
    });

    const result = await resolveIdentifier(TEST_NAME);
    expect(result).toEqual({ pubkey: TEST_PUBKEY, relays: ['wss://relay.example'] });

    const cached = await valkey.get('identifier:' + TEST_NAME);
    expect(cached).toBe(JSON.stringify({ pubkey: TEST_PUBKEY, relays: ['wss://relay.example'] }));
  });

  it('serves a cache hit without re-reading a changed row from Postgres', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: []
    });
    await resolveIdentifier(TEST_NAME); // populates cache

    await db.update(identifiers).set({ ownerPubkey: 'e'.repeat(64) }).where(eq(identifiers.name, TEST_NAME));

    const result = await resolveIdentifier(TEST_NAME);
    expect(result?.pubkey).toBe(TEST_PUBKEY); // still the cached value
  });

  it('never resolves a reserved or blocked identifier', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'reserved',
      ownerPubkey: null
    });

    const result = await resolveIdentifier(TEST_NAME);
    expect(result).toBeNull();
  });

  it('lazily bumps last_identified_at when the stored value is more than a day old', async () => {
    const staleDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      lastIdentifiedAt: staleDate
    });

    await resolveIdentifier(TEST_NAME);

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.lastIdentifiedAt.getTime()).toBeGreaterThan(staleDate.getTime());
  });

  it('does not rewrite last_identified_at when it is already fresh', async () => {
    const freshDate = new Date();
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      lastIdentifiedAt: freshDate
    });

    await resolveIdentifier(TEST_NAME);

    const [row] = await db.select().from(identifiers).where(eq(identifiers.name, TEST_NAME));
    expect(row.lastIdentifiedAt.getTime()).toBe(freshDate.getTime());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/db/identifiers.test.ts`
Expected: FAIL — `./identifiers` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/server/db/identifiers.ts
import { and, eq, lt } from 'drizzle-orm';
import { db } from './index';
import { identifiers } from './schema';
import { valkey } from '../valkey';

const CACHE_PREFIX = 'identifier:';
const CACHE_TTL_SECONDS = 300;
const NEGATIVE_CACHE_TTL_SECONDS = 30;
const NEGATIVE_MARKER = '__miss__';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface ResolvedIdentifier {
  pubkey: string;
  relays: string[];
}

export async function resolveIdentifier(name: string): Promise<ResolvedIdentifier | null> {
  const cacheKey = CACHE_PREFIX + name;

  let cached: string | null = null;
  try {
    cached = await valkey.get(cacheKey);
  } catch {
    cached = null; // fail open to Postgres when the cache is unavailable
  }

  if (cached === NEGATIVE_MARKER) {
    return null;
  }
  if (cached !== null) {
    return JSON.parse(cached) as ResolvedIdentifier;
  }

  const [row] = await db
    .select({
      ownerPubkey: identifiers.ownerPubkey,
      relays: identifiers.relays,
      lastIdentifiedAt: identifiers.lastIdentifiedAt
    })
    .from(identifiers)
    .where(and(eq(identifiers.name, name), eq(identifiers.status, 'claimed')))
    .limit(1);

  if (!row || row.ownerPubkey === null) {
    await cacheSet(cacheKey, NEGATIVE_MARKER, NEGATIVE_CACHE_TTL_SECONDS);
    return null;
  }

  // Lazy staleness bump: updating on every request would turn this hot,
  // unauthenticated route into a write path, defeating the point of the
  // cache above it. A day of slack is far more than enough precision for
  // a 6-month inactivity threshold (see docs/SPEC.md).
  if (Date.now() - row.lastIdentifiedAt.getTime() > STALE_AFTER_MS) {
    await db
      .update(identifiers)
      .set({ lastIdentifiedAt: new Date() })
      .where(and(eq(identifiers.name, name), lt(identifiers.lastIdentifiedAt, new Date(Date.now() - STALE_AFTER_MS))));
  }

  const result: ResolvedIdentifier = { pubkey: row.ownerPubkey, relays: row.relays };
  await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
  return result;
}

async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await valkey.set(key, value, 'EX', ttlSeconds);
  } catch {
    // cache write failures are non-fatal; Postgres remains the source of truth
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/db/identifiers.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/identifiers.ts src/lib/server/db/identifiers.test.ts
git commit -m "feat: add resolveIdentifier read-through cache"
```

---

### Task 7: Seed script

**Files:**
- Create: `scripts/seed.ts`
- Test: `scripts/seed.test.ts`

**Interfaces:**
- Consumes: `db`, `identifiers` from Task 5
- Produces: `seed(): Promise<void>` and `FIXTURES: Array<{ name: string; status: 'claimed'; ownerPubkey: string; relays: string[] }>` from `scripts/seed.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/seed.test.ts
import { afterAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../src/lib/server/db';
import { identifiers } from '../src/lib/server/db/schema';
import { FIXTURES, seed } from './seed';

const names = FIXTURES.map((f) => f.name);

describe('seed', () => {
  afterAll(async () => {
    await db.delete(identifiers).where(inArray(identifiers.name, names));
  });

  it('inserts every fixture identifier', async () => {
    await seed();
    const rows = await db.select().from(identifiers).where(inArray(identifiers.name, names));
    expect(rows).toHaveLength(FIXTURES.length);
  });

  it('is idempotent when run twice', async () => {
    await seed();
    await seed();
    const rows = await db.select().from(identifiers).where(inArray(identifiers.name, names));
    expect(rows).toHaveLength(FIXTURES.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run scripts/seed.test.ts`
Expected: FAIL — `./seed` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/seed.ts
import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { identifiers } from '../src/lib/server/db/schema';

export const FIXTURES = [
  { name: 'alice', status: 'claimed' as const, ownerPubkey: 'a'.repeat(64), relays: ['wss://relay.damus.io'] },
  { name: 'bob', status: 'claimed' as const, ownerPubkey: 'b'.repeat(64), relays: [] as string[] },
  { name: '_', status: 'claimed' as const, ownerPubkey: 'c'.repeat(64), relays: ['wss://relay.phostrich.com'] }
];

export async function seed(): Promise<void> {
  for (const fixture of FIXTURES) {
    await db.insert(identifiers).values(fixture).onConflictDoNothing();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seed()
    .then(() => {
      console.log(`Seeded ${FIXTURES.length} identifiers.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/seed.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/seed.ts scripts/seed.test.ts
git commit -m "feat: add dev/test seed script"
```

---

### Task 8: NIP-05 endpoint

**Files:**
- Create: `src/routes/.well-known/nostr.json/+server.ts`
- Test: `src/routes/.well-known/nostr.json/+server.test.ts`

**Interfaces:**
- Consumes: `resolveIdentifier` from Task 6 (`$lib/server/db/identifiers`), `config.DEFAULT_RELAYS` from Task 3 (`$lib/server/config`)
- Produces: `GET: RequestHandler` — the public NIP-05 route

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/.well-known/nostr.json/+server.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET } from './+server';
import { db } from '$lib/server/db';
import { identifiers } from '$lib/server/db/schema';
import { valkey } from '$lib/server/valkey';
import { config } from '$lib/server/config';

const TEST_NAME = 'foundation-route-test';
const TEST_PUBKEY = 'f'.repeat(64);

function requestEvent(name: string | null) {
  const url = new URL('https://phostrich.test/.well-known/nostr.json');
  if (name !== null) url.searchParams.set('name', name);
  return { url } as unknown as Parameters<typeof GET>[0];
}

describe('GET /.well-known/nostr.json', () => {
  beforeEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  afterEach(async () => {
    await db.delete(identifiers).where(eq(identifiers.name, TEST_NAME));
    await valkey.del('identifier:' + TEST_NAME);
  });

  it('returns an empty names object and the CORS header when name is missing', async () => {
    const response = await GET(requestEvent(null));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({ names: {} });
  });

  it('returns 200 with an empty names object for an unknown name', async () => {
    const response = await GET(requestEvent('nobody-claimed-this'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ names: {} });
  });

  it('returns 200 with an empty names object for a name with invalid characters', async () => {
    const response = await GET(requestEvent('bad name!'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ names: {} });
  });

  it('resolves a claimed identifier case-insensitively', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: ['wss://relay.example']
    });

    const response = await GET(requestEvent(TEST_NAME.toUpperCase()));
    const body = await response.json();
    expect(body.names[TEST_NAME]).toBe(TEST_PUBKEY);
    expect(body.relays[TEST_PUBKEY]).toEqual(['wss://relay.example']);
  });

  it('falls back to DEFAULT_RELAYS when the identifier has none set', async () => {
    await db.insert(identifiers).values({
      name: TEST_NAME,
      status: 'claimed',
      ownerPubkey: TEST_PUBKEY,
      relays: []
    });

    const response = await GET(requestEvent(TEST_NAME));
    const body = await response.json();
    expect(body.relays[TEST_PUBKEY]).toEqual(config.DEFAULT_RELAYS);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run "src/routes/.well-known/nostr.json/+server.test.ts"`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/.well-known/nostr.json/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveIdentifier } from '$lib/server/db/identifiers';
import { config } from '$lib/server/config';

const NAME_PATTERN = /^[a-z0-9._-]+$/;
const MAX_NAME_LENGTH = 64;

export const GET: RequestHandler = async ({ url }) => {
  const headers = { 'Access-Control-Allow-Origin': '*' };
  const rawName = url.searchParams.get('name');

  if (!rawName || rawName.length > MAX_NAME_LENGTH) {
    return json({ names: {} }, { headers });
  }

  const name = rawName.toLowerCase();
  if (!NAME_PATTERN.test(name)) {
    return json({ names: {} }, { headers });
  }

  const resolved = await resolveIdentifier(name);
  if (!resolved) {
    return json({ names: {} }, { headers });
  }

  const relays = resolved.relays.length > 0 ? resolved.relays : config.DEFAULT_RELAYS;

  return json(
    {
      names: { [name]: resolved.pubkey },
      relays: { [resolved.pubkey]: relays }
    },
    { headers }
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/routes/.well-known/nostr.json/+server.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/.well-known/nostr.json/+server.ts" "src/routes/.well-known/nostr.json/+server.test.ts"
git commit -m "feat: add public NIP-05 endpoint"
```

---

### Task 9: Health check endpoint

**Files:**
- Create: `src/routes/healthz/+server.ts`
- Test: `src/routes/healthz/+server.test.ts`

**Interfaces:**
- Consumes: `db` from Task 5 (`$lib/server/db`), `valkey` from Task 4 (`$lib/server/valkey`)
- Produces: `checkHealth(checkDb?, checkValkey?): Promise<{ ok: boolean; postgres: boolean; valkey: boolean }>` and `GET: RequestHandler` from `src/routes/healthz/+server.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/routes/healthz/+server.test.ts
import { describe, expect, it } from 'vitest';
import { checkHealth, GET } from './+server';

describe('checkHealth', () => {
  it('reports ok when both dependencies succeed', async () => {
    const result = await checkHealth(
      () => Promise.resolve(),
      () => Promise.resolve()
    );
    expect(result).toEqual({ ok: true, postgres: true, valkey: true });
  });

  it('reports not ok when Postgres fails', async () => {
    const result = await checkHealth(
      () => Promise.reject(new Error('down')),
      () => Promise.resolve()
    );
    expect(result).toEqual({ ok: false, postgres: false, valkey: true });
  });

  it('reports not ok when Valkey fails', async () => {
    const result = await checkHealth(
      () => Promise.resolve(),
      () => Promise.reject(new Error('down'))
    );
    expect(result).toEqual({ ok: false, postgres: true, valkey: false });
  });
});

describe('GET /healthz', () => {
  it('returns 200 against the real Postgres and Valkey', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, postgres: true, valkey: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/routes/healthz/+server.test.ts`
Expected: FAIL — `./+server` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/routes/healthz/+server.ts
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { valkey } from '$lib/server/valkey';

export async function checkHealth(
  checkDb: () => Promise<unknown> = () => db.execute(sql`select 1`),
  checkValkey: () => Promise<unknown> = () => valkey.ping()
): Promise<{ ok: boolean; postgres: boolean; valkey: boolean }> {
  const [postgres, valkeyOk] = await Promise.all([
    checkDb()
      .then(() => true)
      .catch(() => false),
    checkValkey()
      .then(() => true)
      .catch(() => false)
  ]);
  return { ok: postgres && valkeyOk, postgres, valkey: valkeyOk };
}

export const GET: RequestHandler = async () => {
  const result = await checkHealth();
  return json(result, { status: result.ok ? 200 : 503 });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/routes/healthz/+server.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/healthz/+server.ts src/routes/healthz/+server.test.ts
git commit -m "feat: add /healthz endpoint"
```

---

### Task 10: Full verification and README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–9
- Produces: a documented, end-to-end-verified Foundation slice

- [ ] **Step 1: Write `README.md`**

```markdown
# Phostrich

A NIP-05 identifier provider. See `docs/SPEC.md` for the full product/architecture spec.

## Local development

    cp .env.example .env
    docker compose up -d
    pnpm install
    pnpm db:migrate
    pnpm db:seed
    pnpm dev

The NIP-05 endpoint is then available at:

    curl "http://localhost:5173/.well-known/nostr.json?name=alice"

## Testing

    pnpm test              # watch mode
    pnpm test:coverage      # single run with the 90% coverage gate
```

- [ ] **Step 2: Run the full test suite with coverage**

Run: `pnpm test:coverage`
Expected: all tests pass; coverage report meets the 90% threshold. If any file falls short, add the missing test cases before proceeding (do not lower the threshold).

- [ ] **Step 3: Run static checks**

Run: `pnpm check && pnpm lint`
Expected: both succeed with no errors.

- [ ] **Step 4: Manual end-to-end smoke test**

Run: `pnpm dev` in one terminal, then in another:

```bash
curl -s "http://localhost:5173/.well-known/nostr.json?name=alice" | jq
curl -s "http://localhost:5173/.well-known/nostr.json?name=nobody" | jq
curl -sI "http://localhost:5173/.well-known/nostr.json?name=alice" | grep -i access-control
curl -s "http://localhost:5173/healthz" | jq
```

Expected: `alice` resolves to her seeded pubkey and relay; `nobody` returns `{"names":{}}`; the CORS header is present; `/healthz` reports `{"ok":true,...}`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README for Foundation"
```
