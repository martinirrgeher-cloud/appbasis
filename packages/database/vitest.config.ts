import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 20_000,
    include: ["test/**/*.test.ts"],
  },
});
