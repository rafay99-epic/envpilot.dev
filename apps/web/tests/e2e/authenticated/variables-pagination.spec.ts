import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

// Authenticated e2e — the global variables list at /dashboard/variables.
// Renders via a Convex usePaginatedQuery (api.features.variables.queries.listOrgVariablesWithAccessPaginated).
// This spec asserts the list resolves to either real rows or the documented
// empty state (never stuck loading), and that "Load more" — when present —
// actually grows the row count. Account data varies, so a missing
// "Load more" (too few variables) is not treated as a failure.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("global variables list — pagination", () => {
  test("renders via the paginated query without errors", async ({ page }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard/variables", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Environment Variables" })
    ).toBeVisible({ timeout: 20_000 });

    // The list must settle on either real rows or the documented empty
    // state — never stay stuck on the loading skeleton.
    const table = page.locator("table");
    const emptyState = page.getByText(
      /No variables yet|No matching variables/i
    );
    await expect(
      table.or(emptyState),
      "variables list should resolve to rows or the empty state, not stay loading"
    ).toBeVisible({ timeout: 20_000 });

    const loadMoreButton = page.getByRole("button", { name: /^Load more$/ });
    const hasLoadMore = await loadMoreButton.isVisible().catch(() => false);

    if (hasLoadMore) {
      const rowsBefore = await page.locator("table tbody tr").count();
      await loadMoreButton.click();
      await expect
        .poll(
          async () => {
            // Either the row count grows, or the button disappears because
            // the newly-loaded page was the last one — both are healthy
            // outcomes of clicking "Load more".
            const rowsNow = await page.locator("table tbody tr").count();
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
          "no 'Load more' control — the account does not have enough variables to paginate",
      });
    }

    expect(
      clientErrors,
      `unexpected client-side errors on the variables page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
