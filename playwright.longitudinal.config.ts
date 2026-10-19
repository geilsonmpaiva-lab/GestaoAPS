import { defineConfig } from '@playwright/test';
import staging from './playwright.staging.config';
export default defineConfig({ ...staging, testIgnore: [], testMatch: 'longitudinal.spec.ts', outputDir: 'test-results/longitudinal', reporter: [['line'], ['html', { outputFolder: 'playwright-report/longitudinal', open: 'never' }]] });
