import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

// Authenticated e2e — the revamped /dashboard/usage page (owner-only).
// Asserts the restructured layout: plan strip, quotas & limits groups,
// plan-features grid, and the info bar. All assertions are tier- and
// enforcement-agnostic (the e2e account is pro; the tier-enforcement admin
// toggle may be on or off), so they target structural content that renders
// in every state.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("usage page (revamped layout)", () => {
  test("renders plan strip, grouped quotas, plan features, and info bar", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard/usage", { waitUntil: "domcontentloaded" });

    // Page header (rendered by page.tsx, unchanged by the revamp).
    await expect(
      page.getByRole("heading", { name: /usage/i }).first()
    ).toBeVisible({ timeout: 30_000 });

    // 1. Plan strip — current plan chip + persistent "Compare plans" link.
    await expect(page.getByText("Current plan", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const comparePlans = page.getByRole("link", { name: /compare plans/i });
    await expect(comparePlans).toBeVisible();
    await expect(comparePlans).toHaveAttribute("href", "/pricing");

    // 2. Quotas & limits — every group header is always visible (no
    // collapsible hiding in the new layout).
    for (const group of [
      "Resources",
      "Variables & secrets",
      "Sharing & collaboration",
      "Data retention",
    ]) {
      await expect(
        page.getByRole("heading", { name: group }),
        `quota group "${group}" should be visible without expanding anything`
      ).toBeVisible();
    }

    // Representative quota rows across the groups.
    for (const label of [
      "Projects",
      "Team Members",
      "Pending Invitations",
      "Audit Log Retention",
      "Analytics Retention",
    ]) {
      await expect(
        page.getByText(label, { exact: true }).first(),
        `quota row "${label}" should be visible`
      ).toBeVisible();
    }

    // 3. Plan features — boolean feature grid grouped by category, with the
    // numeric quotas filtered out (they live in the quotas section above).
    await expect(
      page.getByRole("heading", { name: "Variable Management" })
    ).toBeVisible();
    await expect(page.getByText("Bulk Import", { exact: true })).toBeVisible();

    // 4. Info bar — FAQ links.
    await expect(
      page.getByRole("link", { name: /how it works/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /billing faq/i })
    ).toBeVisible();

    expect(
      clientErrors,
      `unexpected client-side errors on the usage page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("per-project variable breakdown toggle expands when present", async ({
    page,
  }) => {
    await page.goto("/dashboard/usage", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Current plan", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // The "By project" toggle only renders when the org has >1 project with
    // variables — self-skip when the fixture data doesn't produce it.
    const toggle = page.getByRole("button", { name: /by project/i });
    if (!(await toggle.isVisible().catch(() => false))) {
      test.skip(true, "org has ≤1 project with variables — no breakdown row");
    }

    await toggle.click();
    // Expanding must reveal at least one per-project meter row beneath the
    // toggle. Every UsageMeter with showValue renders either "N / M" or
    // "Unlimited" next to the project name — assert on that value text
    // inside the toggle's container.
    const container = toggle.locator("..");
    await expect(
      container.getByText(/\d+ \/ \d+|Unlimited/).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
