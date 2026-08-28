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

test('edits relays and releases the identifier', async ({ page }) => {
  claimName = 'e2eacct' + Date.now();
  await signInAndClaim(page, claimName);

  await page.goto('/account');
  await page.getByRole('button', { name: 'Add relay' }).click();
  await page.getByLabel('Relay 1').fill('wss://relay.e2e-test.example');
  await page.getByRole('button', { name: 'Save relays' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Release this identifier' }).click();
  await page.getByRole('button', { name: `Release ${claimName}` }).click();
  await page.waitForURL('**/claim');
});
