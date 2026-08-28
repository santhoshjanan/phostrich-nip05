import type { Page } from '@playwright/test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

export async function installFakeNostrExtension(page: Page): Promise<string> {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);

  await page.exposeFunction('__testGetPublicKey', () => pubkey);
  await page.exposeFunction('__testSignEvent', (template: unknown) =>
    finalizeEvent(template as Parameters<typeof finalizeEvent>[0], secretKey)
  );
  await page.addInitScript(() => {
    window.nostr = {
      // @ts-expect-error test-only global bridge
      getPublicKey: () => window.__testGetPublicKey(),
      // @ts-expect-error test-only global bridge
      signEvent: (template: unknown) => window.__testSignEvent(template)
    };
  });

  return pubkey;
}

export async function signInAndClaim(page: Page, claimName: string): Promise<void> {
  await installFakeNostrExtension(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with extension' }).click();
  await page.waitForURL('**/claim');
  await page.getByLabel('Identifier name').fill(claimName);
  await page.getByText('available', { exact: true }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Claim this name' }).click();
  await page.getByRole('button', { name: 'I understand, claim this name' }).click();
  await page.waitForURL('**/claimed');
}
