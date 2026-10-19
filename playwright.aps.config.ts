import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/aps', workers: 1, retries: 0, timeout: 60_000,
  reporter: [['line'], ['html', { outputFolder: 'playwright-report/aps', open: 'never' }]], outputDir: 'test-results/aps',
  use: { baseURL: 'http://127.0.0.1:3107', serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'off' },
  webServer: process.env.SGC_APS_EXTERNAL_SERVER === 'true' ? undefined : { command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107', url: 'http://127.0.0.1:3107/api/v1/health', reuseExistingServer: false, env: { SGC_DEMO_MODE: 'true', SGC_UX_APS_V3: 'true' } },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
});
