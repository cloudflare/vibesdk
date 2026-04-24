import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for vibesdk E2E tests.
 *
 * Runs against the Vite dev server (`npm run dev`) on http://localhost:5173
 * by default. Override with BASE_URL env for staging/prod runs.
 *
 * Test-mode login expects seeded users — run `npm run db:seed` first.
 */
export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,          // auth state shared across tests — serial is safer
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 2,
    reporter: [['list'], ['html', { open: 'never' }]],
    timeout: 60_000,
    expect: { timeout: 10_000 },

    use: {
        baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        viewport: { width: 1440, height: 900 },
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        // Activate these once critical-path stabilizes on chromium:
        // { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
        // { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
        // { name: 'mobile',   use: { ...devices['iPhone 14'] } },
    ],

    webServer: process.env.CI
        ? undefined
        : {
              command: 'npm run dev',
              url: 'http://localhost:5173',
              reuseExistingServer: true,
              timeout: 120_000,
          },
});
