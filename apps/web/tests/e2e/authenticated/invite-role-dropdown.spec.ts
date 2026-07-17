import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getOwnedOrgSlug, trackClientErrors } from "./support";

// Authenticated e2e — org members invite panel role dropdown. Confirms the
// role <select> is populated from the role registry (listAssignableRoles)
// and, since the E2E user is an org OWNER, lists every seeded registry role
// sorted by level (owner 100 … viewer 20). This spec never submits the
// invite — it only opens the panel and inspects the dropdown, so nothing is
// written.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("org members invite panel — role dropdown", () => {
  test("lists the registry roles for an owner (incl. Editor and Viewer)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getOwnedOrgSlug(page);
    await page.goto(`/organizations/${slug}/members`, {
      waitUntil: "domcontentloaded",
    });

    const inviteButton = page.getByRole("button", { name: /invite member/i });
    await expect(inviteButton).toBeVisible({ timeout: 20_000 });
    await inviteButton.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await expect(drawer).toContainText("Invite Team Member");

    const roleSelect = drawer.locator("select#role");
    await expect(roleSelect).toBeVisible();

    // The options arrive from the listAssignableRoles Convex query — wait
    // until the registry roles have populated the select.
    await expect(roleSelect.locator("option")).toHaveCount(6, {
      timeout: 15_000,
    });
    const roleLabels = (
      await roleSelect.locator("option").allTextContents()
    ).map((t) => t.trim());

    // Registry roles sorted by level desc: owner 100, project_manager 80,
    // team_lead 60, editor 50, developer 40, viewer 20.
    expect(
      roleLabels,
      `expected the six registry role labels for an owner invite, got ${JSON.stringify(roleLabels)}`
    ).toEqual([
      "Owner",
      "Project Manager",
      "Team Lead",
      "Editor",
      "Developer",
      "Viewer",
    ]);

    // Close without inviting anyone — read-only spec.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden({ timeout: 10_000 });

    expect(
      clientErrors,
      `unexpected client-side errors on the org members page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
