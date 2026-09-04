import { expect, test } from "@playwright/test";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { hasE2ECredentials, SKIP_REASON, STORAGE_STATE_PATH } from "../env";
import { authedConvex } from "../convex";
import {
  deleteVariableByKey,
  getWorkerProjectSlug,
  resolveOwnedProject,
  trackClientErrors,
  variableRow,
} from "./support";

// Authenticated e2e — protected environments, end to end through the REAL
// UI: a project owner protects "production" on the Protection settings tab,
// a write to production becomes a change request instead of landing
// directly, the request shows up on the org "Changes" surface (where the
// owner cannot approve their own change), rejecting requires a reason,
// an unprotected write still lands directly (control case), the owner
// cancels the pending change, the audit log records it, and clearing
// protection restores direct writes.
//
// Serial: every test after the first consumes state the earlier ones
// created (the protected config, the pending change request). Each self-
// skips off `gateAvailable` once the first test learns the
// protected_environments feature (or the project.protection.manage
// capability) isn't available for this org/tier — the e2e account is the
// sole user, so anything needing a SECOND human to approve is asserted as
// the refusal (Approve disabled for the requester), never as an approval.

test.skip(!hasE2ECredentials, SKIP_REASON);

const APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const STAMP = Date.now();
const PROTECTED_KEY = `E2E_PROTECTED_${STAMP}`;
const PROTECTED_KEY_2 = `E2E_PROTECTED_${STAMP}_2`;
const DEV_KEY = `E2E_PROTECTED_DEV_${STAMP}`;

test.describe.serial("Protected environments", () => {
  let projectSlug = "";
  let projectId: Id<"projects"> | undefined;
  let gateAvailable = true;

  test("1. owner protects production; it persists across reload", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    projectSlug = await getWorkerProjectSlug(page);
    const resolved = await resolveOwnedProject(page, projectSlug);
    projectId = resolved.project._id;

    // Fixture hygiene: a crashed prior run may have left protection dirty —
    // force the known baseline (nothing protected) before testing the UI.
    const convex = await authedConvex(page.request);
    await convex.mutation(
      convexApi.features.projects.protection.setProtection,
      { projectId, environments: [] }
    );

    await page.goto(
      `/dashboard/projects/${projectSlug}/settings?tab=protection`,
      { waitUntil: "domcontentloaded" }
    );

    const productionCheckbox = page.getByTestId(
      "protection-checkbox-production"
    );
    const visible = await productionCheckbox
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    gateAvailable = visible;
    test.skip(
      !visible,
      "Protection tab/checkboxes not visible — the protected_environments " +
        "feature gate is off for this org/tier, or project.protection.manage " +
        "is missing. Every later test in this file self-skips for the same reason."
    );

    await expect(productionCheckbox).not.toBeChecked();
    await productionCheckbox.check();
    await page.getByTestId("protection-save").click();
    // The save button disables once the draft is committed (dirty resets).
    await expect(page.getByTestId("protection-save")).toBeDisabled({
      timeout: 10_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("protection-checkbox-production")
    ).toBeChecked({ timeout: 15_000 });

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("2. proposing a production-only variable does not create it directly", async ({
    page,
  }) => {
    test.skip(
      !gateAvailable,
      "protected_environments gate unavailable — see test 1"
    );
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Add Variable" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    await drawer.locator("#key").fill(PROTECTED_KEY);
    await drawer.locator("#value").fill(`value-${STAMP}`);

    // Default selection is development only — swap to production only.
    await drawer
      .getByRole("button", { name: "development", exact: true })
      .click();
    await drawer
      .getByRole("button", { name: "production", exact: true })
      .click();

    await expect(drawer.getByTestId("variable-protected-note")).toContainText(
      "production is protected"
    );
    await expect(drawer.getByTestId("variable-submit")).toHaveText(
      "Propose change"
    );

    await drawer.getByTestId("variable-submit").click();
    await expect(drawer).toBeHidden({ timeout: 15_000 });

    await expect(
      page.locator("[data-sonner-toaster]").getByText("Sent for approval.")
    ).toBeVisible({ timeout: 10_000 });

    // A proposal never lands a variable — the row must not exist.
    await expect(variableRow(page, PROTECTED_KEY)).toHaveCount(0, {
      timeout: 10_000,
    });

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("3. the Changes surface lists it pending; the requester cannot approve their own change", async ({
    page,
  }) => {
    test.skip(
      !gateAvailable,
      "protected_environments gate unavailable — see test 1"
    );

    await page.goto("/dashboard/requests", { waitUntil: "domcontentloaded" });
    await page.getByTestId("requests-surface-changes").click();

    const row = page
      .getByTestId("change-request-row")
      .filter({ hasText: PROTECTED_KEY });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText("pending")).toBeVisible();

    await row.click();
    const approveButton = page.getByTestId("change-approve");
    await expect(approveButton).toBeVisible({ timeout: 10_000 });
    // The e2e account is the sole user — it filed this change, so it must
    // never be able to approve its own change.
    await expect(approveButton).toBeDisabled();
    await expect(page.getByTestId("change-cancel")).toBeVisible();
  });

  test("4. reject is disabled until a reason is entered", async ({ page }) => {
    test.skip(
      !gateAvailable,
      "protected_environments gate unavailable — see test 1"
    );

    await page.goto("/dashboard/requests", { waitUntil: "domcontentloaded" });
    await page.getByTestId("requests-surface-changes").click();
    const row = page
      .getByTestId("change-request-row")
      .filter({ hasText: PROTECTED_KEY });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();

    const rejectButton = page.getByTestId("change-reject");
    await expect(rejectButton).toBeVisible({ timeout: 10_000 });
    await expect(rejectButton).toBeDisabled();

    await page
      .getByTestId("change-reject-reason")
      .fill("E2E check only — not actually rejecting this change.");
    await expect(rejectButton).toBeEnabled();

    // Leave the request pending: clear the reason back out (this spec
    // cancels the request in test 6, it never rejects it) and close.
    await page.getByTestId("change-reject-reason").fill("");
    await expect(rejectButton).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  });

  test("5. a development-only variable applies directly (control case)", async ({
    page,
  }) => {
    test.skip(
      !gateAvailable,
      "protected_environments gate unavailable — see test 1"
    );
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Add Variable" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // Production is protected but development isn't selected against it —
    // the submit label stays the normal one, not "Propose change".
    await expect(drawer.getByTestId("variable-submit")).toHaveText(
      "Create Variable"
    );

    await drawer.locator("#key").fill(DEV_KEY);
    await drawer.locator("#value").fill(`value-${STAMP}`);
    // development is selected by default — leave it as is.
    await drawer.getByTestId("variable-submit").click();
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    await expect(variableRow(page, DEV_KEY)).toBeVisible({ timeout: 15_000 });

    await deleteVariableByKey(page, DEV_KEY);
    await expect(variableRow(page, DEV_KEY)).toHaveCount(0, {
      timeout: 10_000,
    });

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("6. canceling the pending change removes it from pending", async ({
    page,
  }) => {
    test.skip(
      !gateAvailable,
      "protected_environments gate unavailable — see test 1"
    );

    await page.goto("/dashboard/requests", { waitUntil: "domcontentloaded" });
    await page.getByTestId("requests-surface-changes").click();
    const row = page
      .getByTestId("change-request-row")
      .filter({ hasText: PROTECTED_KEY });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();

    await page.getByTestId("change-cancel").click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });

    // listForOrg has no pending-only filter, so the row stays — it must now
    // read "canceled", not "pending".
    const updatedRow = page
      .getByTestId("change-request-row")
      .filter({ hasText: PROTECTED_KEY });
    await expect(updatedRow.getByText("canceled")).toBeVisible({
      timeout: 15_000,
    });
    await expect(updatedRow.getByText("pending")).toHaveCount(0);
  });

  test("7. the audit log records the protection and change events for production", async ({
    page,
  }) => {
    test.skip(
      !gateAvailable,
      "protected_environments gate unavailable — see test 1"
    );

    await page.goto("/dashboard/audit", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible(
      { timeout: 20_000 }
    );

    const productionChip = page.getByTestId("audit-env-production");
    await expect(productionChip).toBeVisible({ timeout: 15_000 });
    await productionChip.click();
    await expect(productionChip).toHaveAttribute("aria-pressed", "true");

    const logWindow = page.locator('[class*="divide-y"]').first();
    await expect(logWindow).toBeVisible({ timeout: 20_000 });
    await expect(logWindow.getByText(/change|protection/i).first()).toBeVisible(
      { timeout: 15_000 }
    );

    // Clear the chip.
    await productionChip.click();
    await expect(productionChip).toHaveAttribute("aria-pressed", "false");
  });

  test("8. clearing protection lets production writes apply directly again", async ({
    page,
  }) => {
    test.skip(
      !gateAvailable,
      "protected_environments gate unavailable — see test 1"
    );
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    await page.goto(
      `/dashboard/projects/${projectSlug}/settings?tab=protection`,
      { waitUntil: "domcontentloaded" }
    );
    const productionCheckbox = page.getByTestId(
      "protection-checkbox-production"
    );
    await expect(productionCheckbox).toBeChecked({ timeout: 15_000 });
    await productionCheckbox.uncheck();
    await page.getByTestId("protection-save").click();
    await expect(page.getByTestId("protection-save")).toBeDisabled({
      timeout: 10_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("protection-checkbox-production")
    ).not.toBeChecked({ timeout: 15_000 });

    // Control: production now applies directly, no proposal.
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Add Variable" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    await drawer.locator("#key").fill(PROTECTED_KEY_2);
    await drawer.locator("#value").fill(`value-${STAMP}`);
    await drawer
      .getByRole("button", { name: "development", exact: true })
      .click();
    await drawer
      .getByRole("button", { name: "production", exact: true })
      .click();
    await expect(drawer.getByTestId("variable-submit")).toHaveText(
      "Create Variable"
    );

    await drawer.getByTestId("variable-submit").click();
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    await expect(variableRow(page, PROTECTED_KEY_2)).toBeVisible({
      timeout: 15_000,
    });

    await deleteVariableByKey(page, PROTECTED_KEY_2);
    await expect(variableRow(page, PROTECTED_KEY_2)).toHaveCount(0, {
      timeout: 10_000,
    });

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  // Cleanup as a hook, not a final test: serial mode skips every case after
  // a failure, which would leak a protected environment, a pending change
  // request, or a stray E2E_* variable into every rerun. afterAll only sees
  // worker-scoped fixtures, so it opens its own authenticated context.
  test.afterAll(async ({ browser }) => {
    test.setTimeout(120_000);
    if (!hasE2ECredentials || !projectSlug) return;

    const context = await browser.newContext({
      storageState: STORAGE_STATE_PATH,
      baseURL: APP_ORIGIN,
    });
    const page = await context.newPage();
    try {
      const convex = await authedConvex(page.request);

      if (projectId) {
        // Cancel any leftover pending change request this spec filed — the
        // happy path (test 6) already cancels it, this covers a mid-run
        // failure.
        try {
          const pending = (await convex.query(
            convexApi.features.changeRequests.queries.listForProject,
            { projectId, status: "pending" }
          )) as Array<{ _id: Id<"changeRequests">; label: string }>;
          for (const row of pending) {
            if (row.label === PROTECTED_KEY) {
              await convex.mutation(
                convexApi.features.changeRequests.mutations.cancel,
                { requestId: row._id }
              );
            }
          }
        } catch {
          // Best-effort — nothing to cancel, or already resolved.
        }

        // Restore protection to empty regardless of where the run stopped.
        try {
          await convex.mutation(
            convexApi.features.projects.protection.setProtection,
            { projectId, environments: [] }
          );
        } catch {
          // Best-effort.
        }
      }

      // Delete any variables a mid-run failure left behind.
      await page.goto(`/dashboard/projects/${projectSlug}`, {
        waitUntil: "domcontentloaded",
      });
      for (const key of [DEV_KEY, PROTECTED_KEY_2]) {
        await deleteVariableByKey(page, key);
      }
    } finally {
      await context.close();
    }
  });
});
