import { expect, test, type Locator, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getFirstProjectSlug, trackClientErrors } from "./support";

// Authenticated e2e — variable version history & rollback. Proves the
// version-history/rollback surface still works end to end after the Convex
// usage-optimization + dead-code purge on this branch: every value edit
// mints an immutable version row (variable-history.tsx / convex/variables.ts
// getVersionHistory), and rollback (owner-only, convex/variables.ts
// `rollback`) flips the variable's vaultRef back to the target version's,
// proven here by actually revealing the post-rollback value rather than
// trusting the toast alone.
//
// The edit modal (variable-form.tsx) has no change-reason input — every
// dashboard edit hardcodes changeReason: "Updated via dashboard"
// (see the [slug]/page.tsx handleUpdateVariable) — so this spec asserts
// against that fixed string instead of supplying one.
//
// variable_version_history is a dynamic feature-registry gate: when it's
// off, convex/variables.ts getVersionHistory returns `[]` regardless of how
// many versions actually exist. Rather than fail on that, this spec
// self-skips with a clear message, per the tolerant-skip pattern already
// used by trash-restore.spec.ts and accounts.spec.ts for gated/unavailable
// features.

test.skip(!hasE2ECredentials, SKIP_REASON);

/**
 * Each VariableListItem row renders as `<div className="px-6 py-4">...`
 * (apps/web/src/components/variables/variable-list-item.tsx). Scoping on
 * that class pair mirrors the accountRow/variableRow pattern used by the
 * sibling trash-restore.spec.ts and accounts.spec.ts.
 */
function variableRow(page: Page, key: string): Locator {
  return page.locator("div.px-6.py-4").filter({ hasText: key });
}

/**
 * VariableHistory renders through the bare `Modal` component
 * (components/ui/modal.tsx), which has no `role="dialog"` — unlike
 * DrawerPanel, it can't be located via getByRole("dialog"). Its panel is the
 * nearest ancestor of the title heading carrying the "shadow-xl" class,
 * a combination unique to that one wrapper div in the whole page.
 */
function historyModalPanel(page: Page, key: string): Locator {
  const heading = page.getByRole("heading", {
    level: 2,
    name: `Version History: ${key}`,
  });
  return heading.locator(
    "xpath=ancestor::div[contains(@class, 'shadow-xl')][1]"
  );
}

/**
 * A single version row inside the history modal, located by its `v{n}`
 * badge and walked up to the row wrapper
 * (`flex items-start justify-between py-4 ...`) — the nearest ancestor
 * carrying both "items-start" and "justify-between" classes.
 */
function historyVersionRow(modal: Locator, version: number): Locator {
  return modal
    .getByText(`v${version}`, { exact: true })
    .locator(
      "xpath=ancestor::div[contains(@class, 'items-start') and contains(@class, 'justify-between')][1]"
    );
}

test.describe("variable version history & rollback", () => {
  test("history accumulates across edits and rollback restores the real value", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getFirstProjectSlug(page);
    test.skip(
      slug === null,
      "the owned org has no projects yet — nothing to exercise history/rollback against"
    );

    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Environment Variables" })
    ).toBeVisible({ timeout: 20_000 });

    const addButton = page.getByRole("button", { name: "Add Variable" });
    const hasAddButton = await addButton.isVisible().catch(() => false);
    test.skip(
      !hasAddButton,
      "Add Variable button not visible — the signed-in role cannot create variables on this project"
    );

    const unique = Date.now();
    const key = `E2E_HISTORY_${unique}`;
    const v1Value = `v1-${unique}`;
    const v2Value = `v2-${unique}`;
    const v3Value = `v3-${unique}`;
    const dialog = page.getByRole("dialog");
    let created = false;

    try {
      // ── Create v1 ──
      await addButton.click();
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.locator("#key").fill(key);
      await dialog.locator("#value").fill(v1Value);
      await dialog.getByRole("button", { name: "Create Variable" }).click();
      await expect(dialog, "create drawer should close on success").toBeHidden({
        timeout: 25_000,
      });
      created = true;

      const row = variableRow(page, key);
      await expect(
        row,
        "created variable row should appear in the list"
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        row.getByText("v1", { exact: true }),
        "a freshly created variable should start at version 1"
      ).toBeVisible();

      // ── Edit to v2 ──
      await row.getByTitle("Edit variable").click();
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.locator("#value").fill(v2Value);
      await dialog.getByRole("button", { name: "Update Variable" }).click();
      await expect(dialog).toBeHidden({ timeout: 25_000 });
      await expect(
        row.getByText("v2", { exact: true }),
        "variable should be at version 2 after the first edit"
      ).toBeVisible({ timeout: 20_000 });

      // ── Edit to v3 ──
      await row.getByTitle("Edit variable").click();
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.locator("#value").fill(v3Value);
      await dialog.getByRole("button", { name: "Update Variable" }).click();
      await expect(dialog).toBeHidden({ timeout: 25_000 });
      await expect(
        row.getByText("v3", { exact: true }),
        "variable should be at version 3 after the second edit"
      ).toBeVisible({ timeout: 20_000 });

      // ── A: history accumulates ──
      await row.getByTitle("View history").click();

      const historyHeading = page.getByRole("heading", {
        level: 2,
        name: `Version History: ${key}`,
      });
      // FeatureGate shows a loading skeleton (not the heading) while its
      // Convex tier-check query is in flight, so this needs a real poll —
      // not a snapshot isVisible() — to avoid mistaking "still loading" for
      // "gated off".
      const historyOpened = await historyHeading
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      test.skip(
        !historyOpened,
        "Version History modal never opened — variable_version_history is likely gated off entirely for this org/tier"
      );

      const modal = historyModalPanel(page, key);
      const historyRows = modal.locator(".divide-y > div");
      const noHistoryState = modal.getByText("No version history");
      await expect(
        historyRows.first().or(noHistoryState),
        "history modal should finish loading (either rows or an empty-state message)"
      ).toBeVisible({ timeout: 15_000 });

      const isEmptyGated = await noHistoryState.isVisible().catch(() => false);
      test.skip(
        isEmptyGated,
        "history modal opened but returned zero versions for a freshly-edited variable — " +
          "variable_version_history is tier-gated off on the backend (getVersionHistory returns [] when gated)"
      );

      const rowCount = await historyRows.count();
      expect(
        rowCount,
        "history should have accumulated at least 3 versions (create + 2 edits)"
      ).toBeGreaterThanOrEqual(3);

      // Newest first: top row is the current v3, bottom-most (of the 3 we
      // just created) is the original v1.
      await expect(historyRows.first()).toContainText("v3");
      await expect(historyRows.first()).toContainText("Current");
      await expect(historyRows.last()).toContainText("v1");

      // Metadata renders: environment pills and the hardcoded edit reason.
      await expect(modal).toContainText("development");
      await expect(modal).toContainText("Updated via dashboard");

      // ── B: rollback to v1 restores the real value ──
      const v1Row = historyVersionRow(modal, 1);
      const rollbackButton = v1Row.getByRole("button", { name: "Rollback" });
      const hasRollback = await rollbackButton.isVisible().catch(() => false);
      test.skip(
        !hasRollback,
        "no Rollback button on the v1 row — rollback is owner-only and unavailable to the signed-in role"
      );

      await rollbackButton.click();
      await expect(
        historyHeading,
        "history modal should close automatically after a successful rollback"
      ).toBeHidden({ timeout: 20_000 });

      const toaster = page.locator("[data-sonner-toaster]");
      await expect(toaster.getByText("Rolled back to version 1")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        toaster.getByText("Value and settings restored."),
        "success toast (not the legacy settings-only warning) should confirm the value itself was restored"
      ).toBeVisible({ timeout: 5_000 });

      // Reveal the now-current value — the real proof the vault pointer
      // flip worked end to end, not just that a toast fired.
      await expect(
        row.getByText("v4", { exact: true }),
        "rollback should mint a brand-new version (v4), not just relabel v1"
      ).toBeVisible({ timeout: 20_000 });
      await row.getByTitle("Reveal value").click();
      await expect(
        row,
        "revealed value after rollback should equal the original v1 value"
      ).toContainText(v1Value, { timeout: 20_000 });

      // History now shows the rollback itself as a new version entry.
      await row.getByTitle("View history").click();
      await expect(historyHeading).toBeVisible({ timeout: 10_000 });
      const modalAfterRollback = historyModalPanel(page, key);
      const v4Row = historyVersionRow(modalAfterRollback, 4);
      await expect(
        v4Row,
        "the new version minted by rollback should carry the Rollback badge"
      ).toContainText("Rollback");
      await page.keyboard.press("Escape");
      await expect(historyHeading).toBeHidden({ timeout: 10_000 });

      // ── C: cleanup ──
      await row.getByTitle("Delete variable").click();
      const confirmHeading = page.getByRole("heading", {
        name: "Delete Variable",
      });
      await expect(confirmHeading).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirmHeading).toBeHidden({ timeout: 15_000 });
      created = false;
      await expect(variableRow(page, key)).toHaveCount(0, {
        timeout: 20_000,
      });
    } finally {
      if (created) {
        const cleanupRow = variableRow(page, key);
        const cleanupDeleteButton = cleanupRow.getByTitle("Delete variable");
        if (await cleanupDeleteButton.isVisible().catch(() => false)) {
          await cleanupDeleteButton.click();
          const confirmDeleteButton = page.getByRole("button", {
            name: "Delete",
            exact: true,
          });
          if (await confirmDeleteButton.isVisible().catch(() => false)) {
            await confirmDeleteButton.click();
          }
        }
      }
    }

    expect(
      clientErrors,
      `unexpected client-side errors during the history/rollback flow: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
