import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": dirname,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "e2e"],
    setupFiles: ["./test/setup.ts"],
    css: true,
    clearMocks: true,
    restoreMocks: true,
  },
});
