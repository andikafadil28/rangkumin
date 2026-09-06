import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["frontend-tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./frontend-tests/setup.ts"],
    restoreMocks: true,
  },
});
