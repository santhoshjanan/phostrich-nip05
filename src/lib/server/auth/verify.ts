import { verifiedSymbol, verifyEvent, type Event } from 'nostr-tools';
import { config } from '../config';
import { consumeChallenge } from './challenge';

const AUTH_KIND = 27235;
const FRESHNESS_WINDOW_SECONDS = 60;

export async function verifyAuthEvent(event: Event): Promise<{ pubkey: string } | null> {
  if (event.kind !== AUTH_KIND) return null;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > FRESHNESS_WINDOW_SECONDS) return null;

  const urlTag = event.tags.find((t) => t[0] === 'u')?.[1];
  const methodTag = event.tags.find((t) => t[0] === 'method')?.[1];
  const challengeTag = event.tags.find((t) => t[0] === 'challenge')?.[1];

  if (urlTag !== `${config.PUBLIC_ORIGIN}/auth/verify`) return null;
  if (methodTag !== 'POST') return null;
  if (!challengeTag) return null;

  // nostr-tools caches verification results on a well-known symbol (set by
  // finalizeEvent, for example). Clear it so every call performs a fresh
  // signature check against the event's current bytes rather than trusting
  // a stale cached result from before the event may have been mutated.
  delete (event as Record<symbol, unknown>)[verifiedSymbol];
  if (!verifyEvent(event)) return null;

  const storedChallenge = await consumeChallenge(event.pubkey);
  if (storedChallenge === null || storedChallenge !== challengeTag) return null;

  return { pubkey: event.pubkey };
}
