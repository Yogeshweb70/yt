import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    // Set before modules load so backoff.ts reads 0 (retries claimable at once).
    env: { QUEUE_BACKOFF_BASE_MS: "0", QUEUE_BACKOFF_CAP_MS: "0" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside RSC; stub it so services import cleanly in tests.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
