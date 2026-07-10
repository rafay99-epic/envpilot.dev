import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

// Authenticated e2e — billing surfaces that are reachable WITHOUT a real
// payment: the Settings → Billing tab, and the /api/checkout entry point's
// server-side guards. The hosted Polar checkout itself is external and is
// exercised by the manual go-live smoke test, not here.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("billing", () => {
  test("settings billing tab renders a plan state, not an error", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /settings/i }).first()
    ).toBeVisible({ timeout: 20_000 });

    const billingTab = page.getByRole("button", { name: /billing/i }).first();
    const billingTabVisible = await billingTab.isVisible().catch(() => false);
    test.skip(
      !billingTabVisible,
      "no Billing tab — payments are disabled for this environment (env flag or admin toggle off)"
    );

    await billingTab.click();
    // The tab must resolve to a real plan state — current-plan copy, an
    // upgrade CTA, or a payments-disabled notice — never a blank/error pane.
    await expect(
      page.getByText(/current plan|free|pro|upgrade|subscription/i).first(),
      "billing tab should render a plan state"
    ).toBeVisible({ timeout: 20_000 });

    expect(
      clientErrors,
      `unexpected client-side errors on the billing tab: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("checkout rejects an unknown tier server-side (no client-trusted products)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Drive the real route as the browser would (redirects followed).
    // Payments disabled → route bounces to /pricing (self-skip). Enabled →
    // an unknown tier must land on checkout-success with an error message,
    // proving the product is resolved server-side from the tier name and a
    // client-supplied value can't buy an unmapped product.
    const response = await page.goto(
      "/api/checkout?tier=e2e-nonexistent-tier",
      { waitUntil: "domcontentloaded" }
    );
    expect(response, "checkout route should respond").not.toBeNull();

    const landedOn = new URL(page.url());
    test.skip(
      landedOn.pathname === "/pricing",
      "payments are disabled for this environment — checkout redirects to /pricing"
    );

    expect(
      landedOn.pathname,
      "unknown tier should land on checkout-success with an error"
    ).toBe("/dashboard/checkout-success");
    expect(
      landedOn.searchParams.get("error"),
      "error message should say the plan is unavailable"
    ).toMatch(/not available|contact support/i);
  });
});
