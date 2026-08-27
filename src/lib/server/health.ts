import { sql } from 'drizzle-orm';
import { db } from './db';
import { valkey } from './valkey';

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
