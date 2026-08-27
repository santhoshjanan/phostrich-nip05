import 'dotenv/config';
import { beforeEach } from 'vitest';
import { vi } from 'vitest';

beforeEach(() => {
  // Reset the module cache for dynamic imports in tests
  vi.resetModules();
});
