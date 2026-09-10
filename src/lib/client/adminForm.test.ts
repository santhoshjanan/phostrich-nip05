import { describe, expect, it, vi } from 'vitest';
import { createReservation, forceReleaseIdentifier, removeReservation } from './adminForm';

const CREATE_FALLBACK = 'We could not add this reservation. Please try again.';
const REMOVE_FALLBACK = 'We could not remove the reservation. Please try again.';
const RELEASE_FALLBACK = 'We could not force-release this identifier. Please try again.';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status
  });
}

function rejectingFetcher(): typeof fetch {
  return vi.fn(async () => Promise.reject(new TypeError('private network detail')));
}

describe('createReservation', () => {
  it('returns the create fallback when the request rejects', async () => {
    await expect(createReservation('alice', 'Staff name', rejectingFetcher())).resolves.toEqual({
      ok: false,
      error: CREATE_FALLBACK
    });
  });

  it.each([
    ['malformed success JSON', new Response('not json', { status: 201 })],
    ['an incomplete success object', jsonResponse({ name: 'alice' }, 201)],
    ['malformed failure JSON', new Response('gateway failure', { status: 502 })],
    ['an array failure body', jsonResponse([{ error: 'invalid_name' }], 400)]
  ])('returns the create fallback for %s', async (_caseName, response) => {
    const fetcher = vi.fn(async () => response) as typeof fetch;

    await expect(createReservation('alice', 'Staff name', fetcher)).resolves.toEqual({
      ok: false,
      error: CREATE_FALLBACK
    });
  });

  it('returns the complete server reservation DTO and sends the supplied values', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          name: 'alice-normalized',
          reason: 'Normalized reason',
          actorPubkey: 'a'.repeat(64),
          createdAt: '2026-08-28T14:30:00.000Z'
        },
        201
      )
    ) as typeof fetch;

    await expect(createReservation('alice', 'Staff name', fetcher)).resolves.toEqual({
      ok: true,
      value: {
        name: 'alice-normalized',
        reason: 'Normalized reason',
        actorPubkey: 'a'.repeat(64),
        createdAt: '2026-08-28T14:30:00.000Z'
      }
    });
    expect(fetcher).toHaveBeenCalledWith('/api/admin/reservations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice', reason: 'Staff name' })
    });
  });

  it.each([
    ['invalid_name', 'Enter a valid identifier name.'],
    ['reason_required', 'Enter a reason before continuing.'],
    ['name_claimed', 'That name is currently claimed.'],
    ['name_already_reserved', 'That name is already reserved.']
  ])('maps %s to safe create copy', async (code, error) => {
    const fetcher = vi.fn(async () => jsonResponse({ error: code }, 400)) as typeof fetch;

    await expect(createReservation('alice', 'Staff name', fetcher)).resolves.toEqual({
      ok: false,
      error
    });
  });
});

describe('removeReservation', () => {
  it('returns the remove fallback when the request rejects', async () => {
    await expect(removeReservation('alice', rejectingFetcher())).resolves.toEqual({
      ok: false,
      error: REMOVE_FALLBACK
    });
  });

  it.each([
    ['malformed success JSON', new Response('not json', { status: 200 })],
    ['an invalid success object', jsonResponse({ ok: 'true' }, 200)],
    ['malformed failure JSON', new Response('gateway failure', { status: 502 })],
    ['an array failure body', jsonResponse([{ error: 'not_found' }], 404)]
  ])('returns the remove fallback for %s', async (_caseName, response) => {
    const fetcher = vi.fn(async () => response) as typeof fetch;

    await expect(removeReservation('alice', fetcher)).resolves.toEqual({
      ok: false,
      error: REMOVE_FALLBACK
    });
  });

  it('returns success and URL-encodes the reservation name', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }, 200)) as typeof fetch;

    await expect(removeReservation('alice/example', fetcher)).resolves.toEqual({
      ok: true,
      value: null
    });
    expect(fetcher).toHaveBeenCalledWith('/api/admin/reservations/alice%2Fexample', {
      method: 'DELETE'
    });
  });

  it('maps not_found to safe remove copy', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: 'not_found' }, 404)) as typeof fetch;

    await expect(removeReservation('alice', fetcher)).resolves.toEqual({
      ok: false,
      error: 'That record no longer exists.'
    });
  });
});

describe('forceReleaseIdentifier', () => {
  it('returns the release fallback when the request rejects', async () => {
    await expect(
      forceReleaseIdentifier('alice', 'Inactive account', rejectingFetcher())
    ).resolves.toEqual({
      ok: false,
      error: RELEASE_FALLBACK
    });
  });

  it.each([
    ['malformed success JSON', new Response('not json', { status: 200 })],
    ['an invalid success object', jsonResponse({ ok: 'true' }, 200)],
    ['malformed failure JSON', new Response('gateway failure', { status: 502 })],
    ['an array failure body', jsonResponse([{ error: 'no_longer_eligible' }], 409)]
  ])('returns the release fallback for %s', async (_caseName, response) => {
    const fetcher = vi.fn(async () => response) as typeof fetch;

    await expect(forceReleaseIdentifier('alice', 'Inactive account', fetcher)).resolves.toEqual({
      ok: false,
      error: RELEASE_FALLBACK
    });
  });

  it('returns success and sends the supplied release values', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }, 200)) as typeof fetch;

    await expect(forceReleaseIdentifier('alice', 'Inactive account', fetcher)).resolves.toEqual({
      ok: true,
      value: null
    });
    expect(fetcher).toHaveBeenCalledWith('/api/admin/force-release', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice', reason: 'Inactive account' })
    });
  });

  it.each([
    ['reason_required', 'Enter a reason before continuing.'],
    ['not_found', 'That record no longer exists.'],
    ['no_longer_eligible', 'That identifier is no longer eligible for release.']
  ])('maps %s to safe release copy', async (code, error) => {
    const fetcher = vi.fn(async () => jsonResponse({ error: code }, 409)) as typeof fetch;

    await expect(forceReleaseIdentifier('alice', 'Inactive account', fetcher)).resolves.toEqual({
      ok: false,
      error
    });
  });
});
