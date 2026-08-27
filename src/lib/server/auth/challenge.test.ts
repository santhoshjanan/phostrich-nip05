import { describe, expect, it } from 'vitest';
import { consumeChallenge, issueChallenge } from './challenge';

const TEST_PUBKEY = '1'.repeat(64);

describe('challenge store', () => {
  it('issues a challenge that can be consumed exactly once', async () => {
    const nonce = await issueChallenge(TEST_PUBKEY);
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);

    const consumed = await consumeChallenge(TEST_PUBKEY);
    expect(consumed).toBe(nonce);

    const consumedAgain = await consumeChallenge(TEST_PUBKEY);
    expect(consumedAgain).toBeNull();
  });

  it('returns null for a pubkey with no outstanding challenge', async () => {
    const consumed = await consumeChallenge('2'.repeat(64));
    expect(consumed).toBeNull();
  });
});
