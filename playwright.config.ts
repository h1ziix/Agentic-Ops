import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, retries: 0, timeout: 180_000,
  outputDir: "output/playwright/results", reporter: [["list"], ["json", { outputFile: "output/playwright/smoke-report.json" }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001", browserName: "chromium", headless: true, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
