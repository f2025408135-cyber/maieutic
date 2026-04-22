import { defineConfig } from "vitest/config";

// Opus-hitting suite. Slow (~15s/test), costs real tokens. Not part of the
// default `npm test` cycle; run explicitly with `npm run test:opus`.
export default defineConfig({
  test: {
    include: ["tests/**/*.opus.test.ts"],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    pool: "threads",
    poolOptions: { threads: { maxThreads: 3 } },
    setupFiles: ["tests/setup.opus.ts"],
  },
});
