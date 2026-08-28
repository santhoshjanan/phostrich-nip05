export type AdminWriteResult<T> = { ok: true; value: T } | { ok: false; error: string };
type Fetcher = typeof fetch;

const CREATE_FALLBACK = 'We could not add this reservation. Please try again.';
const REMOVE_FALLBACK = 'We could not remove the reservation. Please try again.';
const RELEASE_FALLBACK = 'We could not force-release this identifier. Please try again.';

const ERROR_COPY: Record<string, string> = {
  invalid_name: 'Enter a valid identifier name.',
  reason_required: 'Enter a reason before continuing.',
  name_claimed: 'That name is currently claimed.',
  name_already_reserved: 'That name is already reserved.',
  not_found: 'That record no longer exists.',
  no_longer_eligible: 'That identifier is no longer eligible for release.'
};

async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  const body = await response.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function failure(body: Record<string, unknown> | null, fallback: string): AdminWriteResult<never> {
  const code = typeof body?.error === 'string' ? body.error : '';
  return { ok: false, error: ERROR_COPY[code] ?? fallback };
}

export async function createReservation(
  name: string,
  reason: string,
  fetcher: Fetcher = fetch
): Promise<
  AdminWriteResult<{ name: string; reason: string; actorPubkey: string; createdAt: string }>
> {
  try {
    const response = await fetcher('/api/admin/reservations', {
      method: 'POST',
      body: JSON.stringify({ name, reason })
    });
    const body = await readBody(response);
    if (
      response.status === 201 &&
      typeof body?.name === 'string' &&
      typeof body.reason === 'string' &&
      typeof body.actorPubkey === 'string' &&
      typeof body.createdAt === 'string'
    ) {
      return {
        ok: true,
        value: {
          name: body.name,
          reason: body.reason,
          actorPubkey: body.actorPubkey,
          createdAt: body.createdAt
        }
      };
    }
    return failure(body, CREATE_FALLBACK);
  } catch {
    return { ok: false, error: CREATE_FALLBACK };
  }
}

export async function removeReservation(
  name: string,
  fetcher: Fetcher = fetch
): Promise<AdminWriteResult<null>> {
  try {
    const response = await fetcher(`/api/admin/reservations/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
    const body = await readBody(response);
    return response.status === 200 && body?.ok === true
      ? { ok: true, value: null }
      : failure(body, REMOVE_FALLBACK);
  } catch {
    return { ok: false, error: REMOVE_FALLBACK };
  }
}

export async function forceReleaseIdentifier(
  name: string,
  reason: string,
  fetcher: Fetcher = fetch
): Promise<AdminWriteResult<null>> {
  try {
    const response = await fetcher('/api/admin/force-release', {
      method: 'POST',
      body: JSON.stringify({ name, reason })
    });
    const body = await readBody(response);
    return response.status === 200 && body?.ok === true
      ? { ok: true, value: null }
      : failure(body, RELEASE_FALLBACK);
  } catch {
    return { ok: false, error: RELEASE_FALLBACK };
  }
}
