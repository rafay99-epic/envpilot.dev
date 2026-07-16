import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getWorkerProjectSlug,
  variableRow,
} from "./support";

// Authenticated e2e — per-project variable search on the project detail page
// (/dashboard/projects/[slug]). The search input drives the server-side
// searchInProject query (api.features.variables.queries.searchInProject),
// which returns access-aware results rendered by the SAME VariableListItem row
// as the paginated list (env badges intact). This spec creates two variables
// with distinctive keys in different environments, then asserts:
//   1. searching a term unique to one finds ONLY it, with its env badge;
//   2. a non-matching term shows the "No matching variables" empty state;
//   3. clearing the input restores the full list.
// Uses the shared per-worker fixture project and unique E2E_ keys, and cleans
// up both variables in a finally so reruns stay green.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("per-project variable search", () => {
  test("finds the right variable by key with its env badge, empty state on miss, restores on clear", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Environment Variables" })
    ).toBeVisible({ timeout: 20_000 });

    const hasAddButton = await page
      .getByRole("button", { name: "Add Variable" })
      .isVisible()
      .catch(() => false);
    test.skip(
      !hasAddButton,
      "Add Variable button not visible — the signed-in role cannot create variables on this project"
    );

    const unique = Date.now();
    const alphaKey = `E2E_SEARCH_ALPHA_${unique}`;
    const bravoKey = `E2E_SEARCH_BRAVO_${unique}`;

    try {
      // Alpha stays in the default `development` env; bravo also toggles
      // `production` so the two hits carry visibly different env badges.
      await createVariable(page, {
        key: alphaKey,
        value: `alpha-${unique}`,
      });
      await createVariable(page, {
        key: bravoKey,
        value: `bravo-${unique}`,
        environments: ["production"],
      });

      const searchInput = page.getByRole("textbox", {
        name: "Search variables",
      });
      await expect(searchInput).toBeVisible({ timeout: 10_000 });

      // ── Search a term unique to alpha ── only alpha's row survives, and its
      // development env badge is still shown on the result row.
      await searchInput.fill(`ALPHA_${unique}`);
      await expect(variableRow(page, alphaKey).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(variableRow(page, bravoKey)).toHaveCount(0);
      await expect(
        variableRow(page, alphaKey).first().getByText("development")
      ).toBeVisible();

      // ── A term that matches nothing ── the search-specific empty state.
      await searchInput.fill(`E2E_NOMATCH_${unique}_ZZZ`);
      await expect(page.getByText(/No matching variables/i)).toBeVisible({
        timeout: 15_000,
      });

      // ── Clear via the × affordance ── the full list returns (both rows).
      await page.getByRole("button", { name: "Clear search" }).click();
      await expect(searchInput).toHaveValue("");
      await expect(variableRow(page, alphaKey).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(variableRow(page, bravoKey).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await deleteVariableByKey(page, alphaKey);
      await deleteVariableByKey(page, bravoKey);
    }
  });
});
