import { defineConfig } from '@playwright/test';
import staging from './playwright.staging.config';
export default defineConfig({ ...staging, testIgnore: [], testMatch: 'aps-v3.spec.ts', outputDir: 'test-results/aps-staging', reporter: [['line'], ['html', { outputFolder: 'playwright-report/aps-staging', open: 'never' }]] });
