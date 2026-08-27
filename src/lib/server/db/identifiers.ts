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
