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
