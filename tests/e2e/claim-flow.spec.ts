// tests/e2e/claim-flow.spec.ts
import { test, expect } from '@playwright/test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

test('sign in with a fake extension and claim an identifier', async ({ page }) => {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);

  await page.exposeFunction('__testGetPublicKey', () => pubkey);
  await page.exposeFunction('__testSignEvent', (template: unknown) => {
    return finalizeEvent(template as Parameters<typeof finalizeEvent>[0], secretKey);
  });

  await page.addInitScript(() => {
    window.nostr = {
      // @ts-expect-error test-only global bridge
      getPublicKey: () => window.__testGetPublicKey(),
      // @ts-expect-error test-only global bridge
      signEvent: (template: unknown) => window.__testSignEvent(template)
    };
  });

  const claimName = 'e2e' + Date.now();

  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with extension' }).click();
  await page.waitForURL('**/claim');

  await page.getByLabel('Identifier name').fill(claimName);
  await expect(page.getByText('available', { exact: true })).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'Claim this name' }).click();
  await page.getByRole('button', { name: 'I understand, claim this name' }).click();

  await page.waitForURL('**/claimed');
  await expect(page.getByText(claimName, { exact: false })).toBeVisible();
});
