import { valkey } from '../valkey';

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  // SET ... NX only succeeds on the first call in a window, so only that
  // call establishes the TTL. If the process dies right after this SET,
  // the key still has a TTL and will self-heal (worst case: an
  // undercounted window), instead of living forever with no expiry.
  await valkey.set(key, 0, 'EX', windowSeconds, 'NX');
  const count = await valkey.incr(key);
  return count <= limit;
}
