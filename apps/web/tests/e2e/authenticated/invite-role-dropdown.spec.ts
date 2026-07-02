import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getOwnedOrgSlug, trackClientErrors } from "./support";

// Authenticated e2e — org members invite panel role dropdown. Confirms the
// role <select> is driven by assignableRoles(actorRole) (lib/roles.ts) and,
// since the E2E user is an org OWNER, lists all four unified roles. This
// spec never submits the invite — it only opens the panel and inspects the
// dropdown, so nothing is written.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("org members invite panel — role dropdown", () => {
  test("lists the unified roles for an owner (Owner/Project Manager/Team Lead/Developer)", async ({
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
    const roleLabels = (
      await roleSelect.locator("option").allTextContents()
    ).map((t) => t.trim());

    // assignableRoles(owner) returns the full ORG_ROLES list in declared
    // order: owner, project_manager, team_lead, developer.
    expect(
      roleLabels,
      `expected all four unified role labels for an owner invite, got ${JSON.stringify(roleLabels)}`
    ).toEqual(["Owner", "Project Manager", "Team Lead", "Developer"]);

    // Close without inviting anyone — read-only spec.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden({ timeout: 10_000 });

    expect(
      clientErrors,
      `unexpected client-side errors on the org members page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
