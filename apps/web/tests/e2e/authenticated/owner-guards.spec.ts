import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  ACCESS_DENIED_TEXT,
  getOwnedOrgSlug,
  trackClientErrors,
} from "./support";

// Authenticated e2e — unified RBAC owner-visible surface. The E2E test user
// is an organization OWNER, so:
//   1. the dashboard nav must render every owner-only link, and
//   2. every page gated by <RequireRole> at a level the owner satisfies must
//      render its real content instead of the "no access" guard state.
// Skips cleanly when credentials are absent (see tests/e2e/env.ts).

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("owner sees the full unified RBAC nav", () => {
  test("dashboard nav renders the owner-only links", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard$/);

    // The desktop sidebar renders inside <aside>; the mobile menu duplicates
    // the same links but is hidden until the hamburger is toggled, so scope
    // to the sidebar to avoid ambiguous matches.
    const sidebar = page.locator("aside").first();
    await expect(
      sidebar,
      "dashboard should render its sidebar nav"
    ).toBeVisible({ timeout: 20_000 });

    // Owner-only nav labels (see components/dashboard/dashboard-nav.tsx):
    // "Team" (team_lead+), "Audit Logs" (project_manager+),
    // "Analytics" (project_manager+), "Usage & Plan" (owner), "Settings" (owner).
    await expect(
      sidebar.getByRole("link", { name: /^Team$/ }),
      "owner should see the Team nav link"
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      sidebar.getByRole("link", { name: /Audit/i }),
      "owner should see the Audit Logs nav link"
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: /^Analytics$/ }),
      "owner should see the Analytics nav link"
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: /Usage/i }),
      "owner should see the Usage & Plan nav link"
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: /^Settings$/ }),
      "owner should see the Settings nav link"
    ).toBeVisible();
  });
});

test.describe("owner-gated pages render real content, not the access guard", () => {
  test("audit, analytics, usage, and org settings all render for the owner", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const slug = await getOwnedOrgSlug(page);
    const clientErrors = trackClientErrors(page);

    const checks: Array<{ path: string; heading: RegExp }> = [
      { path: "/dashboard/audit", heading: /^Audit Logs$/ },
      { path: "/dashboard/analytics", heading: /^Analytics$/ },
      { path: "/dashboard/usage", heading: /usage/i },
      { path: `/organizations/${slug}/settings`, heading: /settings/i },
    ];

    for (const { path, heading } of checks) {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      // Never render the RequireRole "no access" guard for these routes.
      await expect(
        page.getByText(ACCESS_DENIED_TEXT),
        `${path} should not show the access-denied guard for an owner`
      ).toHaveCount(0, { timeout: 20_000 });

      // And the real page content should show up (a heading unique to the
      // page), proving the guard actually resolved to "allowed" rather than
      // still being stuck in its loading state.
      await expect(
        page.getByRole("heading", { name: heading }).first(),
        `${path} should render its real heading for an owner`
      ).toBeVisible({ timeout: 20_000 });
    }

    expect(
      clientErrors,
      `unexpected client-side errors while visiting owner-gated pages: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
