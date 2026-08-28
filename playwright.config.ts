import { defineConfig } from '@playwright/test';
import { FIXED_ADMIN_PUBKEY } from './tests/e2e/helpers/fixedAdminSigner';

const PREVIEW_ORIGIN = 'http://localhost:4173';

// The checked-in signer is authorized only inside the Playwright process and
// the preview server it starts. Production/example configuration stays empty.
process.env.ADMIN_PUBKEYS = FIXED_ADMIN_PUBKEY;
process.env.PUBLIC_ORIGIN = PREVIEW_ORIGIN;

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: PREVIEW_ORIGIN
  },
  webServer: {
    command: 'pnpm preview',
    env: {
      ADMIN_PUBKEYS: FIXED_ADMIN_PUBKEY,
      PUBLIC_ORIGIN: PREVIEW_ORIGIN
    },
    port: 4173,
    reuseExistingServer: false
  }
});
