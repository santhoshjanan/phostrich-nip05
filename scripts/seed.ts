import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { identifiers } from '../src/lib/server/db/schema';

export const FIXTURES = [
  {
    name: 'alice',
    status: 'claimed' as const,
    ownerPubkey: 'a'.repeat(64),
    relays: ['wss://relay.damus.io']
  },
  { name: 'bob', status: 'claimed' as const, ownerPubkey: 'b'.repeat(64), relays: [] as string[] },
  {
    name: '_',
    status: 'claimed' as const,
    ownerPubkey: 'c'.repeat(64),
    relays: ['wss://relay.phostrich.com']
  }
];

export async function seed(): Promise<void> {
  for (const fixture of FIXTURES) {
    await db.insert(identifiers).values(fixture).onConflictDoNothing();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seed()
    .then(() => {
      console.log(`Seeded ${FIXTURES.length} identifiers.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
