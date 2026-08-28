// tests/e2e/claim-flow.spec.ts
import { test, expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { identifierEvents, identifiers } from '../../src/lib/server/db/schema';
import { signInAndClaim } from './helpers/fakeSigner';

let claimName = '';

test.afterEach(async () => {
  if (!claimName) return;
  await db.delete(identifierEvents).where(eq(identifierEvents.identifierName, claimName));
  await db.delete(identifiers).where(eq(identifiers.name, claimName));
  claimName = '';
});

test('sign in with a fake extension and claim an identifier', async ({ page }) => {
  claimName = 'e2e' + Date.now();
  await signInAndClaim(page, claimName);
  await expect(page.getByText(claimName, { exact: false })).toBeVisible();
});
