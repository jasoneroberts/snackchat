import { defineConfig } from "vitest/config";

// Unit tests run in plain Node, without the Cloudflare plugin from vite.config.ts.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
