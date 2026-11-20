import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    css: true,
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    maxWorkers: 2
  }
});
