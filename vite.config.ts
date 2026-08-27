import { sveltekit } from '@sveltejs/kit/vite';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    setupFiles: ['./vitest-setup.ts'],
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The v8 default exclude list includes `**/[.]**`, which matches any
      // path with a dot-prefixed segment — that would silently drop
      // src/routes/.well-known/nostr.json/+server.ts from coverage. Keep
      // every other default exclusion (test files, config files, etc.),
      // just drop that one pattern.
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      exclude: coverageConfigDefaults.exclude.filter((pattern) => pattern !== '**/[.]**'),
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  }
});
