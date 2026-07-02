import fs from "node:fs";
import path from "node:path";

/**
 * Loads the monorepo root `.env.local` into `process.env` (without
 * overriding variables that are already set, e.g. from the shell or CI).
 *
 * Next.js loads `.env.local` on its own, but Playwright's config, the
 * global setup project and the test workers each run in plain Node
 * processes, so they need this loader. It is dependency-free on purpose
 * (dotenv is not installed in this workspace).
 */
function loadRootEnvLocal(): void {
  // tests/e2e -> tests -> apps/web -> apps -> monorepo root
  const envPath = path.resolve(__dirname, "../../../../.env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes, if any.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRootEnvLocal();

export const E2E_TEST_EMAIL = process.env.E2E_TEST_EMAIL;
export const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

/** True when authenticated e2e runs are possible on this machine. */
export const hasE2ECredentials = Boolean(E2E_TEST_EMAIL && E2E_TEST_PASSWORD);

export const SKIP_REASON =
  "Skipped: set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in the root .env.local " +
  "(a WorkOS staging user with email+password auth) to run authenticated e2e specs. " +
  "See apps/web/tests/e2e/README.md.";

/** Where the authenticated session's storage state is persisted. */
export const STORAGE_STATE_PATH = path.resolve(__dirname, ".auth", "user.json");
