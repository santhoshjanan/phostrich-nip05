import Redis from 'ioredis';
import { config } from './config';

// Auth puts Valkey on the critical path of every request (via
// hooks.server.ts), so an outage must fail fast rather than hang for
// ioredis's default multi-tens-of-seconds retry/backoff behavior.
export const valkey = new Redis(config.VALKEY_URL, {
  connectTimeout: 2000,
  commandTimeout: 2000
});
