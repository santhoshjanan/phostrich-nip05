import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isClaimableName } from '$lib/server/identifiers/reservedPatterns';
import { identifierNameExists } from '$lib/server/db/identifiers';
import { checkRateLimit } from '$lib/server/auth/rateLimit';
import { withApiErrorHandling } from '$lib/server/http/errorHandling';

const IP_LIMIT = 60;
const WINDOW_SECONDS = 300;

export const GET: RequestHandler = async ({ url, getClientAddress }) =>
  withApiErrorHandling(async () => {
    const ip = getClientAddress();
    const allowed = await checkRateLimit(
      `ratelimit:availability:ip:${ip}`,
      IP_LIMIT,
      WINDOW_SECONDS
    );
    if (!allowed) {
      return json({ error: 'rate limited' }, { status: 429 });
    }

    const name = (url.searchParams.get('name') ?? '').toLowerCase();

    if (!isClaimableName(name)) {
      return json({ available: false });
    }

    const exists = await identifierNameExists(name);
    return json({ available: !exists });
  });
