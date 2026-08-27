import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkHealth } from '$lib/server/health';

export const GET: RequestHandler = async () => {
  const result = await checkHealth();
  return json(result, { status: result.ok ? 200 : 503 });
};
