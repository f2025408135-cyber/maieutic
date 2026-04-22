import { defineConfig } from "@playwright/test";

// Minimal Playwright config for the demo happy-path test. One browser,
// serial (the test drives a shared DB so parallelism would race), a
// generous timeout per step because several actions wait on real Opus.

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 180_000, // 3 min — real Opus calls inside
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
