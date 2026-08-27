import { valkey } from '../valkey';

export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = await valkey.incr(key);
  if (count === 1) {
    await valkey.expire(key, windowSeconds);
  }
  return count <= limit;
}
