// src/lib/client/auth.ts
import { generateSecretKey } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import type { Event, EventTemplate } from 'nostr-tools';

export function buildAuthEventTemplate(origin: string, challenge: string): EventTemplate {
  return {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', `${origin}/auth/verify`],
      ['method', 'POST'],
      ['challenge', challenge]
    ],
    content: ''
  };
}

async function requestChallenge(pubkey: string): Promise<string> {
  const response = await fetch('/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ pubkey })
  });
  if (!response.ok) {
    throw new Error('Could not request a challenge.');
  }
  const body = await response.json();
  return body.challenge as string;
}

async function submitSignedEvent(event: Event): Promise<void> {
  const response = await fetch('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ event })
  });
  if (!response.ok) {
    throw new Error('Authentication failed.');
  }
}

export async function signInWithExtension(): Promise<void> {
  if (!window.nostr) {
    throw new Error('No Nostr extension detected.');
  }
  const pubkey = await window.nostr.getPublicKey();
  const challenge = await requestChallenge(pubkey);
  const template = buildAuthEventTemplate(window.location.origin, challenge);
  const event = await window.nostr.signEvent(template);
  await submitSignedEvent(event);
}

const BUNKER_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), BUNKER_TIMEOUT_MS);
    })
  ]);
}

export async function signInWithBunker(uri: string): Promise<void> {
  const pointer = await parseBunkerInput(uri);
  if (!pointer) {
    throw new Error('That does not look like a valid bunker connection.');
  }

  const clientSecretKey = generateSecretKey();
  const signer = BunkerSigner.fromBunker(clientSecretKey, pointer);

  await withTimeout(signer.connect(), 'Connection to your signer timed out.');
  const pubkey = await withTimeout(signer.getPublicKey(), 'Connection to your signer timed out.');
  const challenge = await requestChallenge(pubkey);
  const template = buildAuthEventTemplate(window.location.origin, challenge);
  const event = await withTimeout(
    signer.signEvent(template),
    'Connection to your signer timed out.'
  );

  await submitSignedEvent(event);
}
