import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getWorkerProjectSlug,
  variableRow,
} from "./support";

/**
 * Shared variables, driven from the project's variables page — the only entry
 * point the feature has. Share a private row into a group, edit it from the
 * pinned shared block, then stop sharing and confirm the key comes back as a
 * private row. Cleanup deletes the key so reruns start from the same state.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

const SHARED_KEY = "E2E_SHARED_TOKEN";

test.describe("shared variables", () => {
  test("share a variable, edit it, then stop sharing", async ({ page }) => {
    test.setTimeout(150_000);

    const projectSlug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });

    const addButton = page.getByRole("button", { name: "Add Variable" });
    await expect(addButton).toBeVisible({ timeout: 30_000 });

    await createVariable(page, {
      key: SHARED_KEY,
      value: "e2e-shared-value",
      environments: ["development"],
    });

    const shareAction = variableRow(page, SHARED_KEY)
      .first()
      .getByLabel(`Share ${SHARED_KEY} across projects`);
    const canShare = await shareAction.isVisible().catch(() => false);
    if (!canShare) {
      await deleteVariableByKey(page, SHARED_KEY);
      test.skip(
        true,
        "The share action is not offered — this role cannot manage sharing, or the tier gate is off."
      );
      return;
    }

    try {
      // ── Share into a group (default name, no extra projects picked) ──
      await shareAction.click();
      const sheet = page.getByRole("dialog");
      await expect(
        sheet.getByText(`Share ${SHARED_KEY}`, { exact: false })
      ).toBeVisible({ timeout: 15_000 });
      // Nothing else holds this fresh key, so pick the first project that
      // does not have it yet. No pickable project means nothing to share with.
      await expect(sheet.getByRole("checkbox").first()).toBeVisible({
        timeout: 15_000,
      });
      const candidate = sheet
        .getByRole("checkbox", { disabled: false })
        .first();
      if (!(await candidate.isVisible().catch(() => false))) {
        await page.keyboard.press("Escape");
        test.skip(true, "No other project to share with in this org.");
        return;
      }
      await candidate.check();
      await sheet.getByRole("button", { name: /^Share with/ }).click();
      await expect(sheet).toBeHidden({ timeout: 20_000 });

      // The row moves out of the private list into the pinned shared block.
      // Matched case-sensitively so the project nav's "Shared" link and the
      // row's "Share via secure link" control cannot stand in for it.
      await expect(
        page.getByText("shared", { exact: true }).first()
      ).toBeVisible({ timeout: 20_000 });
      await expect(variableRow(page, SHARED_KEY).first()).toBeVisible();

      // ── Editing a shared row warns about its reach ──
      await variableRow(page, SHARED_KEY)
        .first()
        .getByTitle("Edit variable")
        .click();
      await expect(
        page.getByText("Saving changes it in", { exact: false })
      ).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press("Escape");

      // ── Stop sharing, keeping the default private copy ──
      await page.getByRole("button", { name: /stop sharing here/i }).click();
      await page
        .getByRole("button", { name: "Stop sharing", exact: true })
        .click();

      // Back to an ordinary owned row: the delete control only exists on rows
      // this project owns, so its presence is the private-copy assertion.
      await expect(
        variableRow(page, SHARED_KEY).first().getByTitle("Delete variable")
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await page.goto(`/dashboard/projects/${projectSlug}`, {
        waitUntil: "domcontentloaded",
      });
      // A run that died while the row was shared unshares it first so the
      // private copy comes back and the ordinary delete helper can remove it.
      const stopSharing = page.getByRole("button", {
        name: /stop sharing here/i,
      });
      if (await stopSharing.isVisible().catch(() => false)) {
        await stopSharing.click();
        await page
          .getByRole("button", { name: "Stop sharing", exact: true })
          .click();
        await expect(
          variableRow(page, SHARED_KEY).first().getByTitle("Delete variable")
        ).toBeVisible({ timeout: 20_000 });
      }
      await deleteVariableByKey(page, SHARED_KEY);
    }
  });
});
