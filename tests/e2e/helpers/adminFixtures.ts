import { createHash } from 'node:crypto';

export interface AdminFixtures {
  staleName: string;
  reservationName: string;
}

const VALID_IDENTIFIER = /^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/;

export function createAdminFixtures(
  testId: string,
  workerIndex: number,
  retry: number
): AdminFixtures {
  const suffix = createHash('sha256')
    .update(`${testId}:${workerIndex}:${retry}`)
    .digest('hex')
    .slice(0, 12);
  const fixtures = {
    staleName: `e2e-stale-${suffix}`,
    reservationName: `e2e-reservation-${suffix}`
  };

  for (const name of Object.values(fixtures)) {
    if (!VALID_IDENTIFIER.test(name) || name.length > 30) {
      throw new Error(`Invalid Admin e2e fixture name: ${name}`);
    }
  }

  return fixtures;
}
