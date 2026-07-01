import { defineConfig, devices } from "@playwright/test";

// Loads the monorepo root .env.local (E2E_TEST_EMAIL / E2E_TEST_PASSWORD)
// into process.env for the config, the auth setup and the test workers.
import { hasE2ECredentials, STORAGE_STATE_PATH } from "./tests/e2e/env";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Signs in through the hosted WorkOS AuthKit page once and saves the
    // session to tests/e2e/.auth/user.json. Skips itself when
    // E2E_TEST_EMAIL / E2E_TEST_PASSWORD are absent.
    {
      name: "setup",
      testMatch: /e2e\/auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Unauthenticated specs — must keep running WITHOUT any storage state.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/e2e\/authenticated\//, /e2e\/auth\.setup\.ts/],
    },
    // Authenticated specs — reuse the saved AuthKit session. When
    // credentials are absent the storage state file does not exist, so it
    // is left unset and the specs skip themselves (see tests/e2e/env.ts).
    {
      name: "authenticated",
      testMatch: /e2e\/authenticated\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: hasE2ECredentials ? STORAGE_STATE_PATH : undefined,
      },
    },
  ],
  webServer: {
    // "dev" runs `next dev` for this workspace only (Convex functions live on
    // the cloud dev deployment, so the Next.js server alone is sufficient).
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
