import { randomBytes } from 'node:crypto';
import { valkey } from '../valkey';
import { config } from '../config';

export const SESSION_COOKIE_NAME = 'phostrich_session';

interface SessionData {
  pubkey: string;
  createdAt: string;
}

function sessionKey(sessionId: string): string {
  return 'session:' + sessionId;
}

function ttlSeconds(): number {
  return config.SESSION_TTL_DAYS * 24 * 60 * 60;
}

export async function createSession(pubkey: string): Promise<string> {
  const sessionId = randomBytes(32).toString('hex');
  const data: SessionData = { pubkey, createdAt: new Date().toISOString() };
  await valkey.set(sessionKey(sessionId), JSON.stringify(data), 'EX', ttlSeconds());
  return sessionId;
}

export async function getSession(sessionId: string): Promise<{ pubkey: string } | null> {
  const key = sessionKey(sessionId);
  const raw = await valkey.get(key);
  if (!raw) return null;
  await valkey.expire(key, ttlSeconds());
  const data = JSON.parse(raw) as SessionData;
  return { pubkey: data.pubkey };
}

export async function destroySession(sessionId: string): Promise<void> {
  await valkey.del(sessionKey(sessionId));
}
