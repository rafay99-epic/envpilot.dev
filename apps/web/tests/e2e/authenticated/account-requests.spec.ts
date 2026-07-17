import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getWorkerProjectSlug, trackClientErrors } from "./support";

// Authenticated e2e — the account-request surface reachable by the PRO OWNER
// fixture account:
//   1. the project Requests page (/dashboard/projects/[slug]/requests) renders
//      the unified variable+account feed — every rendered row carries a type
//      badge (Variable | Account);
//   2. the project Accounts page shows the owner the direct "Add Account"
//      path, never the developer-only "Request Account" one.
//
// Submitting an account request itself requires an org-role DEVELOPER
// (developers are read+request-only post-lockdown; owners/PMs/team leads are
// rejected by the create mutation by design), and the suite only has the
// owner fixture account — so the submit → approve round-trip cannot be driven
// here and those paths self-skip via the owner-visible assertions instead.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("account requests", () => {
  test("project Requests page renders the unified request feed with type badges", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${slug}/requests`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/variable and account requests/i)
    ).toBeVisible();

    // The feed settles into either the empty state or a list of rows.
    const emptyState = page.getByText("No requests yet.");
    const rows = page.locator("code.font-mono");
    await expect(emptyState.or(rows.first())).toBeVisible({ timeout: 20_000 });

    // Every rendered row (if any) carries a type badge next to its label —
    // the worker fixture project normally has none, so this only exercises
    // the badge when pre-existing requests are present.
    if (!(await emptyState.isVisible())) {
      const rowCount = await rows.count();
      const badgeCount = await page.getByText(/^(Variable|Account)$/).count();
      expect(badgeCount).toBeGreaterThanOrEqual(rowCount);
    }

    expect(errors, `client errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("owner sees Add Account (not the developer-only Request Account) on the Accounts page", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${slug}/accounts`, {
      waitUntil: "domcontentloaded",
    });

    // PRO tier: the shared_accounts gate is open for the fixture org.
    await expect(page.getByRole("button", { name: "Add Account" })).toBeVisible(
      { timeout: 20_000 }
    );
    await expect(
      page.getByRole("button", { name: "Request Account" })
    ).toHaveCount(0);

    expect(errors, `client errors: ${errors.join("\n")}`).toEqual([]);
  });
});
