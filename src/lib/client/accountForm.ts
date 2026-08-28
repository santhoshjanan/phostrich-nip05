type RelaySaveResult = { ok: true; relays: string[] } | { ok: false; error: string };
type ReleaseResult = { ok: true } | { ok: false; error: string };

export async function saveRelays(relays: string[]): Promise<RelaySaveResult> {
  const response = await fetch('/api/account/relays', {
    method: 'PUT',
    body: JSON.stringify({ relays })
  });
  const body = await response.json().catch(() => ({ error: 'unknown_error' }));

  if (response.status === 200) {
    return { ok: true, relays: body.relays };
  }

  return { ok: false, error: body.error ?? 'unknown_error' };
}

export async function releaseIdentifier(): Promise<ReleaseResult> {
  const response = await fetch('/api/account/release', { method: 'POST' });
  if (response.status === 200) {
    return { ok: true };
  }

  const body = await response.json().catch(() => ({ error: 'unknown_error' }));
  return { ok: false, error: body.error ?? 'unknown_error' };
}

export function eligibleForReleaseDate(lastIdentifiedAtIso: string): Date {
  const date = new Date(lastIdentifiedAtIso);
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 6,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    )
  );
}
