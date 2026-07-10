import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

// Authenticated e2e — the org audit log at /dashboard/audit (project_manager+,
// the E2E owner satisfies this). Confirms the category filter carries the
// newer "Tags" / "Templates" categories added alongside the unified RBAC
// work, and that the Convex-paginated log list ("Load more") behaves.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("audit log page", () => {
  test("renders rows, category filter, and pagination", async ({ page }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard/audit", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible(
      { timeout: 20_000 }
    );

    // Category filter must include the newer Tags / Templates categories.
    // Read the options via a retrying poll — allTextContents() is a one-shot
    // DOM query, and an auth-gate remount (RequireRole flickering back to its
    // loading state) landing between toBeVisible() and the read returns []
    // even though the option list is a static array in the page source.
    const categorySelect = page.locator("select").first();
    await expect(categorySelect).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () =>
          (await categorySelect.locator("option").allTextContents()).map((t) =>
            t.trim()
          ),
        {
          message:
            'category filter should include the "Tags" and "Templates" categories',
          timeout: 15_000,
        }
      )
      .toEqual(expect.arrayContaining(["Tags", "Templates"]));

    // The log list must resolve to real rows or the documented empty state.
    const emptyState = page.getByText(
      /No audit events yet|No matching events/i
    );
    const logWindow = page.locator('[class*="divide-y"]').first();
    await expect(
      logWindow.or(emptyState),
      "audit log should resolve to rows or the empty state, not stay loading"
    ).toBeVisible({ timeout: 20_000 });

    const loadMoreButton = page.getByRole("button", { name: /^Load more$/ });
    const hasLoadMore = await loadMoreButton.isVisible().catch(() => false);

    if (hasLoadMore) {
      const rowsBefore = await page
        .locator('[class*="divide-y"] > div')
        .count();
      await loadMoreButton.click();
      await expect
        .poll(
          async () => {
            const rowsNow = await page
              .locator('[class*="divide-y"] > div')
              .count();
            const stillHasButton = await loadMoreButton
              .isVisible()
              .catch(() => false);
            return rowsNow > rowsBefore || !stillHasButton;
          },
          {
            message:
              "clicking 'Load more' should grow the row count or exhaust pagination",
            timeout: 15_000,
          }
        )
        .toBe(true);
    } else {
      test.info().annotations.push({
        type: "note",
        description:
          "no 'Load more' control — the account does not have enough audit events to paginate",
      });
    }

    expect(
      clientErrors,
      `unexpected client-side errors on the audit log page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
