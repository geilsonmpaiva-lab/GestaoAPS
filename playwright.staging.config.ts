import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.SGC_STAGING_APP_URL ?? "http://127.0.0.1:3103";
const host = new URL(baseURL).hostname;
const hosted=host==='gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app';
if (!["127.0.0.1", "localhost", "gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app"].includes(host)) throw new Error("Destino não autorizado para a jornada sintética.");
export default defineConfig({
  testDir: "./tests/integration", testIgnore: 'aps-v3.spec.ts', workers: 1, timeout: 120_000, expect: { timeout: 30_000 }, retries: 0,
  reporter: [["line"], ["html", { outputFolder: hosted?'playwright-report/hosted':'playwright-report/staging', open: "never" }]],
  outputDir: hosted?'test-results/hosted':'test-results/staging', use: { baseURL, ...devices["Desktop Chrome"], actionTimeout: 20_000, navigationTimeout: 30_000, serviceWorkers: "block", screenshot: "only-on-failure", trace: "off" },
});
