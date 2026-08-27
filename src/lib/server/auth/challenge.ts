import { randomBytes } from 'node:crypto';
import { valkey } from '../valkey';

const CHALLENGE_PREFIX = 'challenge:';
const CHALLENGE_TTL_SECONDS = 300;

export async function issueChallenge(pubkey: string): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  await valkey.set(CHALLENGE_PREFIX + pubkey, nonce, 'EX', CHALLENGE_TTL_SECONDS);
  return nonce;
}

export async function consumeChallenge(pubkey: string): Promise<string | null> {
  const result = await valkey.call('GETDEL', CHALLENGE_PREFIX + pubkey);
  return (result as string | null) ?? null;
}
