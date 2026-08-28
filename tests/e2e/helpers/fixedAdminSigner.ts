import type { Page } from '@playwright/test';
import { finalizeEvent, getPublicKey } from 'nostr-tools';

// This must remain aligned with ADMIN_PUBKEYS in .env before the preview server starts.
const FIXED_ADMIN_SECRET_KEY = new Uint8Array(32).fill(0xaa);

export async function installFixedAdminExtension(page: Page): Promise<void> {
  const pubkey = getPublicKey(FIXED_ADMIN_SECRET_KEY);
  await page.exposeFunction('__testGetPublicKey', () => pubkey);
  await page.exposeFunction('__testSignEvent', (template: unknown) =>
    finalizeEvent(template as Parameters<typeof finalizeEvent>[0], FIXED_ADMIN_SECRET_KEY)
  );

  await page.addInitScript(() => {
    window.nostr = {
      // @ts-expect-error test-only global bridge
      getPublicKey: () => window.__testGetPublicKey(),
      // @ts-expect-error test-only global bridge
      signEvent: (template: unknown) => window.__testSignEvent(template)
    };
  });
}

export async function signInAsFixedAdmin(page: Page): Promise<void> {
  await installFixedAdminExtension(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with extension' }).click();
  await page.waitForURL('**/claim');
}
