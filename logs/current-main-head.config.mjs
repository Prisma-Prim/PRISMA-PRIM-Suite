import { defineConfig } from '/workspace/work/659/validation/apps/web/node_modules/@playwright/test/index.mjs';
export default defineConfig({
  testDir: '.', testMatch: 'current-main-head.spec.mjs', workers: 1, retries: 0,
  timeout: 30000, outputDir: './browser-evidence-current-main-head',
  reporter: [['list'], ['json', { outputFile: '/workspace/work/readiness659/current-main-head-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5189',
    proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'narrow', use: { viewport: { width: 390, height: 844 } } },
  ],
});
