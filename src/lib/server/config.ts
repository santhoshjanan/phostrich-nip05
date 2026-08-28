import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  VALKEY_URL: z.string().url(),
  PUBLIC_ORIGIN: z
    .string()
    .url()
    .transform((val) => val.replace(/\/+$/, '')),
  DEFAULT_RELAYS: z
    .string()
    .default('')
    .transform((val) => (val.trim().length === 0 ? [] : val.split(',').map((s) => s.trim())))
    .pipe(z.array(z.string().url())),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ADMIN_PUBKEYS: z
    .string()
    .default('')
    .transform((value) =>
      value.trim().length === 0 ? [] : value.split(',').map((pubkey) => pubkey.trim().toLowerCase())
    )
    .pipe(z.array(z.string().regex(/^[0-9a-f]{64}$/)))
});

export type Config = z.infer<typeof envSchema>;
export const config: Config = envSchema.parse(process.env);
