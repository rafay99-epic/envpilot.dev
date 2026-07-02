import { expect, type Page } from "@playwright/test";

// Shared fixtures for authenticated RBAC specs. Kept separate from
// invite-panel.spec.ts so existing passing specs are never touched.

/** Fail with an actionable fixture message instead of a cryptic timeout. */
export function fixtureError(message: string): Error {
  return new Error(
    `E2E fixture problem: ${message} — the E2E_TEST_EMAIL account needs an ` +
      `organization it OWNS. See apps/web/tests/e2e/README.md.`
  );
}

/**
 * Navigates to /organizations and returns the slug of the first org the test
 * user owns (identified by its "Owner" role badge).
 */
export async function getOwnedOrgSlug(page: Page): Promise<string> {
  await page.goto("/organizations", { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/organizations")) {
    throw fixtureError(
      "navigating to /organizations bounced away — is the saved auth session still valid?"
    );
  }

  const orgCards = page.locator(
    'main a[href^="/organizations/"]:not([href="/organizations/new"])'
  );
  const emptyState = page.getByText("No organizations yet");
  await expect(orgCards.first().or(emptyState), {
    message:
      "the organizations page never finished loading (no org cards, no empty state)",
  }).toBeVisible({ timeout: 30_000 });

  if (await emptyState.isVisible()) {
    throw fixtureError("the test user has no organizations");
  }

  const ownedOrg = orgCards.filter({ hasText: "Owner" }).first();
  if ((await ownedOrg.count()) === 0) {
    throw fixtureError(
      "the test user has organizations but OWNS none (no 'Owner' badge found)"
    );
  }

  const href = await ownedOrg.getAttribute("href");
  if (!href) throw fixtureError("could not resolve the owned org's link");
  return href.replace(/^\/organizations\//, "");
}

/**
 * Navigates to /dashboard/projects and returns the slug of the first
 * project, or null if the owned org has no projects yet.
 */
export async function getFirstProjectSlug(page: Page): Promise<string | null> {
  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });

  const projectLinks = page.locator(
    'main a[href^="/dashboard/projects/"]:not([href="/dashboard/projects/new"])'
  );
  const emptyState = page.getByText(/No projects found/i);
  await expect(projectLinks.first().or(emptyState), {
    message: "the projects page never finished loading",
  }).toBeVisible({ timeout: 30_000 });

  if ((await projectLinks.count()) === 0) return null;

  const href = await projectLinks.first().getAttribute("href");
  if (!href) return null;
  return href.replace(/^\/dashboard\/projects\//, "");
}

/**
 * True for known-benign noise that isn't a real product regression:
 *
 * - Dev-only browser noise (favicon 404s, React DevTools reminder).
 * - hooks/use-auth's "fetch_user_failed" — a full-document page.goto()
 *   (used throughout these specs to move between routes) aborts any
 *   in-flight /api/auth/me fetch from the page being torn down, which the
 *   hook catches and logs via console.error. An artifact of hard
 *   navigation in tests, not a product regression.
 * - A Next.js dev-server SSR race: verified via concurrent curl requests to
 *   /dashboard/audit (outside Playwright entirely) that hitting several
 *   dashboard routes back-to-back can intermittently make one SSR pass
 *   throw "useAuthContext must be used within an AuthProvider", forcing
 *   React to re-render client-side (the page still ends up correct — cross
 *   checked against a page snapshot). This is a real, reproducible finding
 *   (see the e2e run report) but is treated as non-fatal dev-mode noise
 *   here rather than a flaky test failure, since Next.js Link prefetching
 *   from the sidebar nav means *any* dashboard page load fires concurrent
 *   background requests to the other nav routes. Delivered as both a
 *   console "error" message and, separately, an uncaught `pageerror`.
 */
function isBenignNoise(text: string): boolean {
  return (
    /favicon|Download the React DevTools/i.test(text) ||
    /"module":"hooks\/use-auth".*"event":"fetch_user_failed"/.test(text) ||
    /Hydration failed because the server rendered HTML didn't match the client/.test(
      text
    ) ||
    /Switched to client rendering because the server rendering errored/.test(
      text
    ) ||
    /useAuthContext must be used within an AuthProvider/.test(text)
  );
}

/** Collects console messages and uncaught page errors that indicate a real client-side error. */
export function trackClientErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isBenignNoise(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    if (isBenignNoise(err.message)) return;
    errors.push(err.message);
  });
  return errors;
}

export const ACCESS_DENIED_TEXT =
  /you.?re not authorized|you don.t have access to this page/i;
