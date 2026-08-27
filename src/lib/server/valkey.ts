import Redis from 'ioredis';
import { config } from './config';

export const valkey = new Redis(config.VALKEY_URL);
