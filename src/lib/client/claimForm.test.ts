// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { checkAvailability, debounce, submitClaim } from './claimForm';

describe('debounce', () => {
  it('only calls the wrapped function once after the wait elapses', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced('a');
    debounced('b');
    debounced('c');
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');

    vi.useRealTimers();
  });
});

describe('checkAvailability', () => {
  it('returns true when the endpoint reports available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ available: true }), { status: 200 }))
    );
    expect(await checkAvailability('alice')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('returns false when the endpoint reports unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 }))
    );
    expect(await checkAvailability('admin')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('throws (does not silently resolve to false) on a non-200 response like a 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }))
    );
    await expect(checkAvailability('alice')).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('submitClaim', () => {
  it('returns ok: true on 201', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ name: 'alice' }), { status: 201 }))
    );
    expect(await submitClaim('alice')).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  it('returns the server error code on conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'not_available' }), { status: 409 }))
    );
    expect(await submitClaim('alice')).toEqual({ ok: false, error: 'not_available' });
    vi.unstubAllGlobals();
  });
});
