import { defineConfig } from '@playwright/test';
import staging from './playwright.staging.config';
export default defineConfig({ ...staging, testIgnore: [], testMatch: 'longitudinal-offline.spec.ts', outputDir: 'test-results/longitudinal-offline', reporter: [['line'], ['html', { outputFolder: 'playwright-report/longitudinal-offline', open: 'never' }]], use: { ...staging.use, serviceWorkers: 'allow' } });
