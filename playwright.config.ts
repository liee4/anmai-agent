import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { ...devices['Desktop Edge'], channel: 'msedge', baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
