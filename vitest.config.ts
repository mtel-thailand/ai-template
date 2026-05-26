import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['memory/src/**/*.spec.ts', 'memory/tests/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    globals: false,
    environment: 'node',
  },
});
