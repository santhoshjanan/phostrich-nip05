import { json } from '@sveltejs/kit';

export async function withApiErrorHandling(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error('[api] request failed:', err);
    return json({ error: 'service unavailable' }, { status: 503 });
  }
}
