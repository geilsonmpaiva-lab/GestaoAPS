import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.SGC_STAGING_APP_URL ?? "http://127.0.0.1:3103";
const host = new URL(baseURL).hostname;
if (!["127.0.0.1", "localhost", "gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app"].includes(host)) throw new Error("Destino não autorizado para a jornada sintética.");
export default defineConfig({
  testDir: "./tests/integration", workers: 1, timeout: 120_000, expect: { timeout: 30_000 }, retries: 0,
  reporter: [["line"], ["html", { outputFolder: "playwright-report/staging", open: "never" }]],
  outputDir: "test-results/staging", use: { baseURL, ...devices["Desktop Chrome"], serviceWorkers: "block", screenshot: "only-on-failure", trace: "off" },
});
