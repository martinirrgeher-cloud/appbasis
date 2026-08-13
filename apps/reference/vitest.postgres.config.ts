import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.postgres.e2e.ts'],
  },
});
