import { describe, expect, it } from 'vitest';
import { createAdminFixtures } from '../../../../tests/e2e/helpers/adminFixtures';

const VALID_IDENTIFIER = /^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/;

describe('createAdminFixtures', () => {
  it('creates deterministic, distinct, validator-safe names from the test execution identity', () => {
    const first = createAdminFixtures('reservation workflow', 12, 3);
    const repeated = createAdminFixtures('reservation workflow', 12, 3);
    const retried = createAdminFixtures('reservation workflow', 12, 4);
    const otherTest = createAdminFixtures('force-release workflow', 12, 3);

    expect(first).toEqual(repeated);
    expect(first.staleName).not.toBe(first.reservationName);
    expect(retried).not.toEqual(first);
    expect(otherTest).not.toEqual(first);

    for (const name of Object.values(first)) {
      expect(name.length).toBeLessThanOrEqual(30);
      expect(name).toMatch(VALID_IDENTIFIER);
    }
  });
});
