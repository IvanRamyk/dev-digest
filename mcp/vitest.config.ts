import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Single-sourced Zod contracts live in the server's vendored shared; this
      // package borrows them read-only via the tsconfig path alias. Vitest (Vite)
      // does not read tsconfig `paths`, so mirror the alias here — same as
      // reviewer-core/vitest.config.ts.
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.it.test.ts', 'src/**/*.test.ts'],
  },
});
