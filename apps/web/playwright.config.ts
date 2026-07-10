import { defineConfig, devices } from "@playwright/test";

// Loads the monorepo root .env.local (E2E_TEST_EMAIL / E2E_TEST_PASSWORD)
// into process.env for the config, the auth setup and the test workers.
import { hasE2ECredentials, STORAGE_STATE_PATH } from "./tests/e2e/env";

// CI runs the suite against a PRODUCTION build: `next build` happens as a
// prior workflow step, then PLAYWRIGHT_WEB_CMD="bun run start". A cold
// `next dev` on a CI runner compiles every route on demand, stretching the
// suite ~7× (12m vs 1.7m) and blowing open every timing window (Convex
// auth-attach races, reveal timeouts). Locally the defaults are unchanged:
// reuse the already-running dev server on :3000.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const WEB_CMD = process.env.PLAYWRIGHT_WEB_CMD ?? "bun run dev";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
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
    // Default "dev" runs `next dev` for this workspace only (Convex functions
    // live on the cloud dev deployment, so the Next.js server alone is
    // sufficient). CI overrides via PLAYWRIGHT_WEB_CMD to serve the
    // production build instead.
    command: WEB_CMD,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
