import { json } from '@sveltejs/kit';

export async function withAuthErrorHandling(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error('[auth] request failed:', err);
    return json({ error: 'service unavailable' }, { status: 503 });
  }
}
