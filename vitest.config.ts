import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Password hashing and PDF shaping are slow when every core is busy.
    testTimeout: 20000,
    include: ["src/**/*.test.ts"],
    setupFiles: [resolve(__dirname, "./vitest.setup.ts")],
  },
});
