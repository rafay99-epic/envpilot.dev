import { expect, test, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getOwnedOrgSlug,
  getWorkerProjectSlug,
  variableRow,
} from "./support";

/**
 * Shared variables, driven from the project's variables page — the only entry
 * point the feature has. Share a private row into a group, edit it from the
 * pinned shared block, then stop sharing and confirm the key comes back as a
 * private row. Cleanup deletes the key so reruns start from the same state.
 *
 * The org-level "Share variables across projects" switch (settings → Shared
 * tab) gates the whole feature: with it off, projects show no share action
 * at all. These specs turn it on where the feature under test needs it and
 * restore whatever state they found, so a run never leaves the org's
 * org-wide sharing toggled differently than before.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

const SHARED_KEY = "E2E_SHARED_TOKEN";
const SHARE_SWITCH_NAME = "Share variables across projects";

async function goToSharedSettingsTab(page: Page, orgSlug: string) {
  await page.goto(`/organizations/${orgSlug}/settings?tab=shared`, {
    waitUntil: "domcontentloaded",
  });
}

/**
 * Navigates to the org's Shared settings tab and turns the sharing switch on
 * if it's currently off. Skips the test when the switch is absent (role
 * cannot manage sharing, or the tier gate is off) or disabled. Returns
 * whether the switch was off beforehand, so a caller can restore it in
 * cleanup.
 */
async function ensureShareSwitchOn(
  page: Page,
  orgSlug: string
): Promise<boolean> {
  await goToSharedSettingsTab(page, orgSlug);
  const shareSwitch = page.getByRole("switch", { name: SHARE_SWITCH_NAME });
  const visible = await shareSwitch.isVisible().catch(() => false);
  test.skip(
    !visible,
    "Share-across-projects switch not present — this role cannot manage sharing, or the tier gate is off."
  );
  const disabled = await shareSwitch.isDisabled().catch(() => false);
  test.skip(disabled, "Share-across-projects switch is disabled for this org.");

  const wasOff = (await shareSwitch.getAttribute("aria-checked")) === "false";
  if (wasOff) {
    await shareSwitch.click();
    await expect(shareSwitch).toHaveAttribute("aria-checked", "true", {
      timeout: 15_000,
    });
  }
  return wasOff;
}

test.describe("shared variables", () => {
  test("share a variable, edit it, then stop sharing", async ({ page }) => {
    test.setTimeout(150_000);

    const orgSlug = await getOwnedOrgSlug(page);
    const turnedOn = await ensureShareSwitchOn(page, orgSlug);

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

      // Restore the org-wide switch to whatever state this test found.
      if (turnedOn) {
        await goToSharedSettingsTab(page, orgSlug);
        const shareSwitch = page.getByRole("switch", {
          name: SHARE_SWITCH_NAME,
        });
        if ((await shareSwitch.getAttribute("aria-checked")) === "true") {
          await shareSwitch.click();
          await expect(shareSwitch).toHaveAttribute("aria-checked", "false", {
            timeout: 15_000,
          });
        }
      }
    }
  });

  test("switch off hides the share action", async ({ page }) => {
    test.setTimeout(90_000);

    const orgSlug = await getOwnedOrgSlug(page);
    await ensureShareSwitchOn(page, orgSlug);

    const projectSlug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("button", { name: "Add Variable" })
    ).toBeVisible({ timeout: 30_000 });

    const key = `E2E_SHARE_TOGGLE_${Date.now()}`;
    await createVariable(page, {
      key,
      value: "e2e-toggle-value",
      environments: ["development"],
    });

    try {
      // ── Turn the switch off, then confirm the share action disappears ──
      await goToSharedSettingsTab(page, orgSlug);
      const shareSwitch = page.getByRole("switch", {
        name: SHARE_SWITCH_NAME,
      });
      await shareSwitch.click();
      await expect(shareSwitch).toHaveAttribute("aria-checked", "false", {
        timeout: 15_000,
      });

      await page.goto(`/dashboard/projects/${projectSlug}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByRole("button", { name: "Add Variable" })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        variableRow(page, key)
          .first()
          .getByLabel(`Share ${key} across projects`)
      ).not.toBeVisible({ timeout: 15_000 });
    } finally {
      // Turn the switch back on regardless of how the assertions above went.
      await goToSharedSettingsTab(page, orgSlug);
      const shareSwitch = page.getByRole("switch", {
        name: SHARE_SWITCH_NAME,
      });
      if ((await shareSwitch.getAttribute("aria-checked")) === "false") {
        await shareSwitch.click();
        await expect(shareSwitch).toHaveAttribute("aria-checked", "true", {
          timeout: 15_000,
        });
      }

      await page.goto(`/dashboard/projects/${projectSlug}`, {
        waitUntil: "domcontentloaded",
      });
      await deleteVariableByKey(page, key);
    }
  });

  test("merge sheet opens from the settings tab", async ({ page }) => {
    test.setTimeout(60_000);

    const orgSlug = await getOwnedOrgSlug(page);
    const turnedOn = await ensureShareSwitchOn(page, orgSlug);

    try {
      await goToSharedSettingsTab(page, orgSlug);

      // No duplicate keys across the org's projects means nothing to merge.
      const mergeAllButton = page.getByRole("button", { name: "Merge all" });
      const hasMergeAll = await mergeAllButton.isVisible().catch(() => false);
      test.skip(
        !hasMergeAll,
        "No identical-across-projects duplicates in this org to merge."
      );

      await mergeAllButton.click();
      const drawer = page.getByRole("dialog");
      await expect(
        drawer.getByText("Merge identical variables", { exact: true })
      ).toBeVisible({ timeout: 15_000 });

      await expect(
        drawer.getByRole("button", { name: "production", exact: true })
      ).toHaveAttribute("aria-pressed", "false");
      await expect(
        drawer.getByRole("button", { name: "development", exact: true })
      ).toHaveAttribute("aria-pressed", "true");

      // No submit — this test only verifies the sheet opens with the right
      // defaults, never mutates real data.
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden({ timeout: 10_000 });
    } finally {
      if (turnedOn) {
        await goToSharedSettingsTab(page, orgSlug);
        const shareSwitch = page.getByRole("switch", {
          name: SHARE_SWITCH_NAME,
        });
        if ((await shareSwitch.getAttribute("aria-checked")) === "true") {
          await shareSwitch.click();
          await expect(shareSwitch).toHaveAttribute("aria-checked", "false", {
            timeout: 15_000,
          });
        }
      }
    }
  });
});
