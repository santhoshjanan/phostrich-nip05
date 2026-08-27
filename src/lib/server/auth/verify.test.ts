import { describe, expect, it } from 'vitest';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  type Event,
  type EventTemplate
} from 'nostr-tools';
import { config } from '../config';
import { issueChallenge } from './challenge';
import { verifyAuthEvent } from './verify';

function buildEvent(
  overrides: Partial<{
    kind: number;
    url: string;
    method: string;
    challenge: string;
    createdAt: number;
  }>,
  secretKey: Uint8Array
): Event {
  const template: EventTemplate = {
    kind: overrides.kind ?? 27235,
    created_at: overrides.createdAt ?? Math.floor(Date.now() / 1000),
    tags: [
      ['u', overrides.url ?? `${config.PUBLIC_ORIGIN}/auth/verify`],
      ['method', overrides.method ?? 'POST'],
      ['challenge', overrides.challenge ?? '']
    ],
    content: ''
  };
  return finalizeEvent(template, secretKey);
}

describe('verifyAuthEvent', () => {
  it('accepts a correctly signed, fresh event with a matching challenge', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);

    const result = await verifyAuthEvent(buildEvent({ challenge: nonce }, sk));
    expect(result).toEqual({ pubkey });
  });

  it('rejects a tampered signature', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);
    const event = buildEvent({ challenge: nonce }, sk);
    event.sig = event.sig.slice(0, -2) + '00';

    expect(await verifyAuthEvent(event)).toBeNull();
  });

  it('rejects the wrong kind', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);

    expect(await verifyAuthEvent(buildEvent({ kind: 1, challenge: nonce }, sk))).toBeNull();
  });

  it('rejects a stale timestamp', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);
    const stale = Math.floor(Date.now() / 1000) - 120;

    expect(
      await verifyAuthEvent(buildEvent({ challenge: nonce, createdAt: stale }, sk))
    ).toBeNull();
  });

  it('rejects a mismatched u tag', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);

    expect(
      await verifyAuthEvent(
        buildEvent({ challenge: nonce, url: `${config.PUBLIC_ORIGIN}/other-path` }, sk)
      )
    ).toBeNull();
  });

  it('rejects a non-POST method tag', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);

    expect(
      await verifyAuthEvent(buildEvent({ challenge: nonce, method: 'GET' }, sk))
    ).toBeNull();
  });

  it('rejects a mismatched challenge', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    await issueChallenge(pubkey);

    expect(await verifyAuthEvent(buildEvent({ challenge: 'wrong-nonce' }, sk))).toBeNull();
  });

  it('rejects an event when no challenge was ever issued', async () => {
    const sk = generateSecretKey();

    expect(await verifyAuthEvent(buildEvent({ challenge: 'some-nonce' }, sk))).toBeNull();
  });

  it('rejects a reused challenge (single-use)', async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const nonce = await issueChallenge(pubkey);
    const event = buildEvent({ challenge: nonce }, sk);

    expect(await verifyAuthEvent(event)).toEqual({ pubkey });
    expect(await verifyAuthEvent(event)).toBeNull();
  });
});
