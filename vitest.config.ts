import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.test.jsonc",
      },
    }),
  ],
});
