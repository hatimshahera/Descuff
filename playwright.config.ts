import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "packages",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  use: {
    trace: "on-first-retry"
  }
});
