type RelaySaveResult = { ok: true; relays: string[] } | { ok: false; error: string };
type ReleaseResult = { ok: true } | { ok: false; error: string };

const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';
const SAVE_ERROR = 'We could not save your relays. Please try again.';
const RELEASE_ERROR = 'We could not release this identifier. Please try again.';

export function parseRelayError(error: string): { index: number; message: string } | null {
  const match = /^relay (\d+):\s*(.+)$/i.exec(error);
  if (!match) return null;

  const relayNumber = Number(match[1]);
  const message = match[2].trim();
  if (!Number.isSafeInteger(relayNumber) || relayNumber < 1 || !message) return null;

  return { index: relayNumber - 1, message };
}

function hasError(body: unknown): body is { error: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string'
  );
}

export async function saveRelays(relays: string[]): Promise<RelaySaveResult> {
  let response: Response;
  try {
    response = await fetch('/api/account/relays', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ relays })
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }

  if (response.status === 200) {
    if (
      typeof body === 'object' &&
      body !== null &&
      Array.isArray((body as { relays?: unknown }).relays) &&
      (body as { relays: unknown[] }).relays.every((relay) => typeof relay === 'string')
    ) {
      return { ok: true, relays: (body as { relays: string[] }).relays };
    }

    return { ok: false, error: SAVE_ERROR };
  }

  return { ok: false, error: hasError(body) ? body.error : SAVE_ERROR };
}

export async function releaseIdentifier(): Promise<ReleaseResult> {
  let response: Response;
  try {
    response = await fetch('/api/account/release', { method: 'POST' });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  if (response.status === 200) {
    return { ok: true };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: RELEASE_ERROR };
  }

  return { ok: false, error: hasError(body) ? body.error : RELEASE_ERROR };
}

export function eligibleForReleaseDate(lastIdentifiedAtIso: string): Date {
  const date = new Date(lastIdentifiedAtIso);
  const targetMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 6, 1));
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const targetLastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(date.getUTCDate(), targetLastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}
