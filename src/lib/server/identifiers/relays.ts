const MAX_RELAYS = 8;

export type RelayValidationResult = { ok: true; relays: string[] } | { ok: false; error: string };

export function validateRelayList(
  relays: string[],
  options: { allowInsecure?: boolean } = {}
): RelayValidationResult {
  if (relays.length > MAX_RELAYS) {
    return { ok: false, error: `no more than ${MAX_RELAYS} relays are allowed` };
  }

  const allowedProtocols = options.allowInsecure ? new Set(['wss:', 'ws:']) : new Set(['wss:']);
  const seen = new Set<string>();
  const normalizedRelays: string[] = [];

  for (const [index, relay] of relays.entries()) {
    let parsed: URL;
    try {
      parsed = new URL(relay);
    } catch {
      return { ok: false, error: `relay ${index + 1}: not a valid URL` };
    }

    if (!allowedProtocols.has(parsed.protocol)) {
      return { ok: false, error: `relay ${index + 1}: must start with wss://` };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, error: `relay ${index + 1}: must not include credentials` };
    }
    if (parsed.search) {
      return { ok: false, error: `relay ${index + 1}: must not include a query string` };
    }

    const normalized = parsed.toString();
    const dedupeKey = normalized.replace(/\/+$/, '');
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      normalizedRelays.push(normalized);
    }
  }

  return { ok: true, relays: normalizedRelays };
}
