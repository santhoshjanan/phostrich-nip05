import { afterAll, describe, expect, it, vi } from 'vitest';
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

describe('migrate (CLI entrypoint)', () => {
  it('applies migrations against the real Postgres and exits 0', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await import('./migrate?t=' + Date.now());
      await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0), { timeout: 5000 });
    } finally {
      exitSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
