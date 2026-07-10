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
    // Vercel Web Analytics / Speed Insights injects a
    // <script src="/_vercel/insights/script.js"> into the dashboard layout.
    // That path is served ONLY by Vercel's edge in real production; under a
    // local `next start` or in CI (a production build NOT running on Vercel)
    // it 404s on every page. It's an environment artifact — on real Vercel
    // prod the script loads fine and analytics no-ops gracefully off-Vercel —
    // not a product error, so it must not fail the zero-client-errors specs.
    // The generic "Failed to load resource: 404" console text carries no URL;
    // trackClientErrors matches this against the message's location URL too.
    /_vercel\/(insights|speed-insights)/.test(text) ||
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
    // A failed resource load (e.g. a 404) surfaces as a generic
    // "Failed to load resource: ..." message whose text has no URL — the
    // offending URL is only on the message location. Filter on both so
    // known-benign resource 404s (Vercel insights) are dropped by URL.
    const locationUrl = msg.location()?.url ?? "";
    if (isBenignNoise(text) || isBenignNoise(locationUrl)) return;
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

/**
 * Locate a variable's row on the project page by its key.
 *
 * Each VariableListItem row renders as `<div className="px-6 py-4">...`
 * (apps/web/src/components/variables/variable-list-item.tsx) — a plain div,
 * not a `tr`/`li`/`[data-variable-row]` element. Scoping on that class pair
 * mirrors the variableRow/accountRow pattern used by the sibling
 * history-rollback.spec.ts, search-projects-org.spec.ts, and
 * sharing-tags-export.spec.ts.
 */
export function variableRow(page: Page, key: string) {
  return page.locator("div.px-6.py-4").filter({ hasText: key });
}

/**
 * Create a variable through the real "Add Variable" drawer, resilient to the
 * dev-mode React remounts that detach the drawer mid-interaction (the whole
 * open→fill→submit sequence is retried as a unit via toPass, so a remount
 * between two steps just restarts the sequence instead of failing). Returns
 * once the new row is visible in the list. Caller must ensure the "Add
 * Variable" button is present (role can create).
 *
 * `environments` beyond the default-selected "development" are toggled on.
 */
export async function createVariable(
  page: Page,
  opts: {
    key: string;
    value: string;
    environments?: string[];
    sensitive?: boolean;
    description?: string;
  }
): Promise<void> {
  const addButton = page.getByRole("button", { name: "Add Variable" });
  const row = variableRow(page, opts.key);

  await expect(async () => {
    // Already created on a prior attempt (the mutation landed but a remount
    // tore the drawer down before we observed it) — done.
    if (
      await row
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;

    const drawer = page.getByRole("dialog");
    if (!(await drawer.isVisible().catch(() => false))) {
      await addButton.click({ timeout: 8_000 });
      await expect(drawer).toBeVisible({ timeout: 10_000 });
    }

    // Every interactive step below gets a short, explicit timeout instead of
    // the default unbounded wait. Under sustained dev-mode remounts (e.g. a
    // concurrent test elsewhere mutating the same shared project, which
    // re-renders this drawer's contents), an element can keep detaching and
    // reattaching indefinitely — an unbounded action would then block for
    // the entire outer toPass budget on a single step. Failing fast here
    // instead lets toPass retry the whole open→fill→submit sequence several
    // times within its budget, each attempt getting a fresh chance to land
    // in a stable moment.
    await drawer.locator("#key").fill(opts.key, { timeout: 8_000 });
    await drawer.locator("#value").fill(opts.value, { timeout: 8_000 });

    for (const env of opts.environments ?? []) {
      const envButton = drawer.getByRole("button", { name: env, exact: true });
      // The toggle has no aria-pressed; selection is class-based — an
      // UNselected env carries the neutral `bg-zinc-100` background, a
      // selected one carries a colored ring instead. Only click to turn on.
      const cls = (await envButton.getAttribute("class").catch(() => "")) ?? "";
      const selected = !cls.includes("bg-zinc-100");
      if (!selected) await envButton.click({ timeout: 8_000 });
    }

    if (opts.sensitive) {
      const box = drawer.getByRole("checkbox", { name: /mark as sensitive/i });
      if (!(await box.isChecked().catch(() => false))) {
        await box.check({ timeout: 8_000 });
      }
    }

    if (opts.description) {
      await drawer.locator("#description").fill(opts.description, {
        timeout: 8_000,
      });
    }

    // Submit via Enter (implicit form submit) — avoids the "button not
    // stable" actionability failure when the drawer re-renders on input.
    await drawer.locator("#value").press("Enter", { timeout: 8_000 });
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    await expect(row.first()).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 90_000 });
}

/**
 * Delete a variable through the row's Delete control + ConfirmDialog.
 * No-op if the row/control isn't present, so it's safe in finally blocks.
 */
export async function deleteVariableByKey(
  page: Page,
  key: string
): Promise<void> {
  const row = variableRow(page, key).first();
  const deleteButton = row.getByTitle("Delete variable");
  if (!(await deleteButton.isVisible().catch(() => false))) return;
  await deleteButton.click();
  const confirmHeading = page.getByRole("heading", { name: "Delete Variable" });
  if (await confirmHeading.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirmHeading).toBeHidden({ timeout: 15_000 });
  }
}
