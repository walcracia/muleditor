import { defineConfig } from "@playwright/test";

// Dev-server readiness must stay local even on machines with a CLI proxy.
process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost", "::1"].filter(Boolean).join(",");

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:6401",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    proxy: process.env.PLAYWRIGHT_PROXY ? {
      server: process.env.PLAYWRIGHT_PROXY,
      bypass: "127.0.0.1,localhost"
    } : undefined,
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure"
  },
  outputDir: "output/e2e",
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:6401",
    reuseExistingServer: !process.env.CI
  }
});
