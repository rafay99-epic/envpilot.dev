import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  ACCESS_DENIED_TEXT,
  getWorkerProjectSlug,
  trackClientErrors,
} from "./support";

// Authenticated e2e — project members "Add Member" flow. Confirms the panel
// is a right-side slide-over (DrawerPanel) rather than a centered modal, and
// that picking a member whose org role is Developer reveals the
// "Environment access" section. Never submits the form (read-only spec —
// nothing is written).

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("project members — add member drawer", () => {
  test("opens as a right-side slide-over, not a centered modal", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${slug}/members`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Project Members" })
    ).toBeVisible({ timeout: 20_000 });

    // Even when there's nothing to add, the page itself must be healthy:
    // no access-denied guard, no client-side error.
    await expect(page.getByText(ACCESS_DENIED_TEXT)).toHaveCount(0);
    expect(
      clientErrors,
      `unexpected client-side errors on the project members page: ${clientErrors.join("\n")}`
    ).toEqual([]);

    const addMemberButton = page.getByRole("button", { name: /^Add Member$/ });
    const hasAddButton = await addMemberButton.isVisible().catch(() => false);
    test.skip(
      !hasAddButton,
      "no assignable members for this project (owner has no one below them to add) — structural page load already verified (no access-denied state, no client errors)"
    );

    await addMemberButton.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer, "Add Member drawer should open").toBeVisible({
      timeout: 10_000,
    });
    await expect(drawer).toContainText("Add Project Member");

    // Structural check: a right-side slide-over is docked to the right edge
    // and spans the full viewport height (inset-y-0). A centered modal would
    // instead float with margin on every side. Compare the drawer's bounding
    // box against the viewport.
    const viewport = page.viewportSize();
    expect(viewport, "viewport size should be available").toBeTruthy();
    const box = await drawer.boundingBox();
    expect(box, "drawer should have a bounding box").toBeTruthy();
    if (box && viewport) {
      const rightEdgeGap = viewport.width - (box.x + box.width);
      const bottomEdgeGap = viewport.height - (box.y + box.height);
      expect(
        rightEdgeGap,
        "drawer should be docked flush to the right edge of the viewport"
      ).toBeLessThan(2);
      expect(box.y, "drawer should reach the top edge (full height)").toBe(0);
      expect(
        bottomEdgeGap,
        "drawer should reach the bottom edge (full height)"
      ).toBeLessThan(2);
    }

    // Selecting a member whose org role is Developer should reveal the
    // "Environment access" section (EnvironmentScopeSelector).
    const memberSelect = drawer.locator("select").first();
    await expect(memberSelect).toBeVisible();
    const options = memberSelect.locator("option");
    const optionCount = await options.count();
    let developerValue: string | null = null;
    for (let i = 0; i < optionCount; i++) {
      const text = await options.nth(i).textContent();
      if (text && /-\s*Developer\s*$/.test(text.trim())) {
        developerValue = await options.nth(i).getAttribute("value");
        break;
      }
    }

    if (developerValue) {
      await memberSelect.selectOption(developerValue);
      await expect(
        drawer.getByText(/environment access/i),
        "selecting a Developer member should reveal 'Environment access'"
      ).toBeVisible({ timeout: 10_000 });
    } else {
      test.info().annotations.push({
        type: "note",
        description:
          "no addable member with org role Developer was available — Environment access reveal not exercised",
      });
    }

    // Close without submitting — this spec never mutates data.
    await drawer.getByRole("button", { name: /^Cancel$/ }).click();
    await expect(drawer).toBeHidden({ timeout: 10_000 });

    expect(
      clientErrors,
      `unexpected client-side errors on the project members page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
