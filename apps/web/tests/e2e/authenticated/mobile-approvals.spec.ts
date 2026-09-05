import { expect, test } from "@playwright/test";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { authedConvex } from "../convex";
import {
  getWorkerProjectSlug,
  resolveOwnedProject,
  trackClientErrors,
} from "./support";

// Authenticated e2e — reviewing a change request from a phone. A
// notification deep-links to `/dashboard/requests?change=<id>`; at phone
// width that URL must open the review drawer directly with the decision
// buttons on screen, and closing the drawer must drop the param again.
//
// The change request is filed through the real Add Variable drawer at
// desktop width (the same path protected-environments.spec.ts drives), then
// the viewport shrinks to 390x844 for the part under test. The e2e account
// is the sole user, so it can never approve its own change: the assertion is
// that Approve is reachable, and Cancel is what actually runs.

test.skip(!hasE2ECredentials, SKIP_REASON);

const PHONE = { width: 390, height: 844 };
const STAMP = Date.now();
const KEY = `E2E_MOBILE_${STAMP}`;

test.describe.serial("Mobile approvals", () => {
  let projectSlug = "";
  let projectId: Id<"projects"> | undefined;
  let requestId: Id<"changeRequests"> | undefined;

  test.afterAll(async ({ request }) => {
    if (!projectId) return;
    const convex = await authedConvex(request);
    await convex.mutation(
      convexApi.features.projects.protection.setProtection,
      { projectId, environments: [] }
    );
  });

  test("1. a filed production change opens from its deep link at phone width", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    projectSlug = await getWorkerProjectSlug(page);
    const resolved = await resolveOwnedProject(page, projectSlug);
    projectId = resolved.project._id;

    const convex = await authedConvex(page.request);
    const protectedOk = await convex
      .mutation(convexApi.features.projects.protection.setProtection, {
        projectId,
        environments: ["production"],
      })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !protectedOk,
      "protected_environments gate is off for this org/tier"
    );

    // File the change through the real UI at desktop width.
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Add Variable" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await drawer.locator("#key").fill(KEY);
    await drawer.locator("#value").fill(`value-${STAMP}`);
    await drawer
      .getByRole("button", { name: "development", exact: true })
      .click();
    await drawer
      .getByRole("button", { name: "production", exact: true })
      .click();
    await expect(drawer.getByTestId("variable-submit")).toHaveText(
      "Propose change"
    );
    await drawer.getByTestId("variable-submit").click();
    await expect(drawer).toBeHidden({ timeout: 15_000 });

    const rows = await convex.query(
      convexApi.features.changeRequests.queries.listForProject,
      { projectId }
    );
    const filed = rows.find(
      (row) => row.label === KEY && row.status === "pending"
    );
    expect(
      filed,
      "the proposal should be listed as a pending change"
    ).toBeTruthy();
    requestId = filed!._id;

    // The part under test: the notification link on a phone.
    await page.setViewportSize(PHONE);
    await page.goto(`/dashboard/requests?change=${requestId}`, {
      waitUntil: "domcontentloaded",
    });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText(KEY, { timeout: 20_000 });
    await expect(page.getByTestId("requests-surface-changes")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Approve and Cancel sit in the pinned footer: on screen with no scroll.
    const approve = page.getByTestId("change-approve");
    await expect(approve).toBeVisible();
    await expect(approve).toBeDisabled();
    const box = await approve.boundingBox();
    expect(box, "approve button should have a layout box").toBeTruthy();
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);

    await page.getByTestId("change-cancel").click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/change=/);

    // The stacked row still carries the outcome.
    const row = page.getByTestId("change-request-row").filter({ hasText: KEY });
    await expect(row.getByText("canceled")).toBeVisible({ timeout: 15_000 });

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("2. ?surface=changes selects the Changes tab on load", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/dashboard/requests?surface=changes", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("requests-surface-changes")).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 20_000 }
    );
    await expect(
      page.getByTestId("requests-surface-variables")
    ).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("requests-surface-variables").click();
    await expect(page).not.toHaveURL(/surface=/);
  });
});
