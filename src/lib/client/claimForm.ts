export type AvailabilityState = 'idle' | 'checking' | 'available' | 'unavailable' | 'error';

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

export async function checkAvailability(name: string): Promise<boolean> {
  const response = await fetch(`/api/identifiers/availability?name=${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error(`availability check failed with status ${response.status}`);
  }
  const body = await response.json();
  return body.available === true;
}

export async function submitClaim(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch('/api/identifiers/claim', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  if (response.status === 201) {
    return { ok: true };
  }
  const body = await response.json().catch(() => ({ error: 'unknown_error' }));
  return { ok: false, error: body.error ?? 'unknown_error' };
}
