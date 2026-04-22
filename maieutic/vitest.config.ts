import { defineConfig } from "vitest/config";

// Default suite — mocks or pure-code tests only. Excludes anything that
// hits Opus (those live in *.opus.test.ts and run via `npm run test:opus`).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "**/*.opus.test.ts",
      "node_modules",
      ".next",
      "tests/e2e/**",
    ],
    testTimeout: 15_000,
  },
});
