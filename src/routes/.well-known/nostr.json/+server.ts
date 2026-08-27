import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveIdentifier } from '$lib/server/db/identifiers';
import { config } from '$lib/server/config';

const NAME_PATTERN = /^[a-z0-9._-]+$/;
const MAX_NAME_LENGTH = 64;

export const GET: RequestHandler = async ({ url }) => {
  const headers = { 'Access-Control-Allow-Origin': '*' };
  const rawName = url.searchParams.get('name');

  if (!rawName || rawName.length > MAX_NAME_LENGTH) {
    return json({ names: {} }, { headers });
  }

  const name = rawName.toLowerCase();
  if (!NAME_PATTERN.test(name)) {
    return json({ names: {} }, { headers });
  }

  const resolved = await resolveIdentifier(name);
  if (!resolved) {
    return json({ names: {} }, { headers });
  }

  const relays = resolved.relays.length > 0 ? resolved.relays : config.DEFAULT_RELAYS;

  return json(
    {
      names: { [name]: resolved.pubkey },
      relays: { [resolved.pubkey]: relays }
    },
    { headers }
  );
};
