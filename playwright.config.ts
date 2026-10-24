import { defineConfig } from '@playwright/test'

// End-to-end tests drive the production build in the installed Chrome, each test
// in a fresh temporary profile: they never see the real data on this machine.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4191',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'laptop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4191 --strictPort',
    url: 'http://localhost:4191',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
