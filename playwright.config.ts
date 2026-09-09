import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  reporter: "html",
  use: { baseURL: "http://localhost:3101", trace: "on-first-retry" },
  webServer: { command: "npm run start -- -p 3101", url: "http://localhost:3101/api/v1/health", reuseExistingServer: false, env: { SGC_DEMO_MODE: "true" } },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 14"] } }
  ]
});
