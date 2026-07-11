import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

// Authenticated e2e — billing management UX:
//   1. /dashboard/settings?tab=billing deep-links straight to the Billing tab
//   2. the usage page's plan strip links to it ("Manage billing")
//   3. cancellation requires a feedback reason before Confirm enables
//      (self-skips unless the account has a live Polar subscription — the
//      e2e account's pro tier comes from userTiers, not a real sub)

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("billing management", () => {
  test("settings deep-link ?tab=billing opens the Billing tab", async ({
    page,
  }) => {
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard/settings?tab=billing", {
      waitUntil: "domcontentloaded",
    });

    // Billing tab content — the Subscription card heading — must be visible
    // without any tab clicking.
    await expect(
      page.getByRole("heading", { name: "Subscription" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Billing Actions" })
    ).toBeVisible();

    expect(
      clientErrors,
      `unexpected client-side errors on settings billing tab: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("usage page plan strip links to billing management", async ({
    page,
  }) => {
    await page.goto("/dashboard/usage", { waitUntil: "domcontentloaded" });

    const manageBilling = page.getByRole("link", { name: /manage billing/i });
    await expect(manageBilling).toBeVisible({ timeout: 30_000 });
    await expect(manageBilling).toHaveAttribute(
      "href",
      "/dashboard/settings?tab=billing"
    );

    await manageBilling.click();
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=billing/);
    await expect(
      page.getByRole("heading", { name: "Subscription" })
    ).toBeVisible({ timeout: 30_000 });
  });

  test("cancellation requires a feedback reason", async ({ page }) => {
    await page.goto("/dashboard/settings?tab=billing", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Subscription" })
    ).toBeVisible({ timeout: 30_000 });

    // Cancel Plan only renders for a live Polar subscription — self-skip
    // when the fixture account doesn't have one.
    const cancelPlan = page.getByRole("button", { name: "Cancel Plan" });
    if (!(await cancelPlan.isVisible().catch(() => false))) {
      test.skip(
        true,
        "e2e account has no live Polar subscription — cancel flow not reachable"
      );
    }

    await cancelPlan.click();
    const confirmButton = page.getByRole("button", {
      name: "Confirm Cancellation",
    });
    await expect(confirmButton).toBeVisible({ timeout: 10_000 });

    // Reason unselected → Confirm must be disabled.
    await expect(confirmButton).toBeDisabled();

    // Selecting a reason enables it; we do NOT click it (that would cancel
    // a real subscription) — the required-feedback gate is what's under test.
    await page.locator("#cancelReason").selectOption("other");
    await expect(confirmButton).toBeEnabled();

    // Back out without canceling.
    await page.getByRole("button", { name: "Go Back" }).click();
    await expect(confirmButton).toBeHidden();
  });
});
