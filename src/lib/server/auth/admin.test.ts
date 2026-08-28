import { describe, expect, it } from 'vitest';
import { isAdmin } from './admin';

describe('isAdmin', () => {
  it('returns true for a pubkey in the provided allowlist', () => {
    expect(isAdmin('a'.repeat(64), ['a'.repeat(64)])).toBe(true);
  });

  it('compares pubkeys case-insensitively', () => {
    expect(isAdmin('A'.repeat(64), ['a'.repeat(64)])).toBe(true);
  });

  it('returns false when the pubkey is absent from the allowlist', () => {
    expect(isAdmin('b'.repeat(64), ['a'.repeat(64)])).toBe(false);
  });

  it('uses the configured allowlist by default', () => {
    expect(isAdmin('definitely-not-configured')).toBe(false);
  });
});
