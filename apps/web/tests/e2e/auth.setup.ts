import fs from "node:fs";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

import {
  E2E_TEST_EMAIL,
  E2E_TEST_PASSWORD,
  hasE2ECredentials,
  SKIP_REASON,
  STORAGE_STATE_PATH,
} from "./env";

/**
 * Setup project: signs in once through the hosted WorkOS AuthKit page and
 * persists the resulting app-domain session cookies to
 * `tests/e2e/.auth/user.json`. The "authenticated" Playwright project
 * depends on this and reuses that storage state for every spec.
 *
 * When E2E_TEST_EMAIL / E2E_TEST_PASSWORD are absent this setup is skipped
 * (and the authenticated specs skip themselves too), so the suite stays
 * green on machines without credentials.
 */
setup("authenticate via WorkOS AuthKit", async ({ page }) => {
  setup.skip(!hasE2ECredentials, SKIP_REASON);
  // The hosted AuthKit round-trip (redirects + form screens) can be slow.
  setup.setTimeout(120_000);

  const email = E2E_TEST_EMAIL as string;
  const password = E2E_TEST_PASSWORD as string;

  // 1. Hitting a protected route triggers the middleware redirect to the
  //    hosted AuthKit sign-in page (api.workos.com -> authkit domain).
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(
    page,
    "expected the middleware to redirect signed-out visitors to AuthKit"
  ).not.toHaveURL(/localhost:3000/, { timeout: 30_000 });

  // 2. Email step. AuthKit usually asks for the email first, then reveals
  //    the password field on a second screen — but some configurations show
  //    both at once. Selectors carry fallbacks for both layouts.
  const emailInput = page
    .locator(
      'input[type="email"], input[name="email"], input[autocomplete="username"], input[id="email"]'
    )
    .first();
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(email);

  const passwordInput = page
    .locator(
      'input[type="password"], input[name="password"], input[autocomplete="current-password"]'
    )
    .first();

  // If the password field is not on the first screen, submit the email step.
  if (!(await passwordInput.isVisible().catch(() => false))) {
    const continueButton = page
      .locator('button[type="submit"]')
      .or(page.getByRole("button", { name: /continue|next|sign in/i }))
      .first();
    await continueButton.click();
    await passwordInput.waitFor({ state: "visible", timeout: 30_000 });
  }

  // 3. Password step.
  await passwordInput.fill(password);
  const submitButton = page
    .locator('button[type="submit"]')
    .or(page.getByRole("button", { name: /continue|sign in|log in/i }))
    .first();
  await submitButton.click();

  // 4. AuthKit redirects back to the app callback, which sets the session
  //    cookie and forwards to the original return path (/dashboard) — or it
  //    shows a credential error, in which case fail fast with a clear
  //    message instead of a 60s timeout.
  const credentialError = page
    .getByText(/invalid email or password|incorrect password|try again/i)
    .first();
  const outcome = await Promise.race([
    page
      .waitForURL(/localhost:3000\/dashboard/, { timeout: 60_000 })
      .then(() => "signed-in" as const)
      .catch(() => "timeout" as const),
    credentialError
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => "rejected" as const)
      .catch(() => "timeout" as const),
  ]);
  if (outcome === "rejected") {
    throw new Error(
      "WorkOS AuthKit rejected E2E_TEST_EMAIL / E2E_TEST_PASSWORD " +
        "('Invalid email or password'). Verify the test user exists in the " +
        "WorkOS environment this app points at, has this exact password, and " +
        "that Email + Password authentication is enabled. " +
        "See apps/web/tests/e2e/README.md."
    );
  }
  if (outcome === "timeout") {
    throw new Error(
      "Signed in but never returned to localhost:3000/dashboard — check the " +
        "WORKOS_REDIRECT_URI configuration and that the dev server is healthy."
    );
  }
  await expect(page).toHaveURL(/\/dashboard/);

  // 5. Persist the session for the authenticated project.
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
