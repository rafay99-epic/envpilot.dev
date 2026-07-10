import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getWorkerProjectSlug,
  trackClientErrors,
  variableRow,
} from "./support";

// Authenticated e2e — core Variable lifecycle against a real project:
// create (multi-env + sensitive), reveal, edit value + description, clear a
// previously-set description (regression coverage for the
// convex/variables.ts `update` fix where `description: ""` must actually
// clear the field server-side instead of being silently coerced to
// "keep current"), duplicate-key rejection, and delete cleanup. Runs on the
// perf/convex-cleanup branch to prove the backend cleanup didn't regress the
// variable CRUD surface.
//
// Mirrors trash-restore.spec.ts / accounts.spec.ts conventions: shared owned
// -org project, `div.px-6.py-4` row scoping, try/finally best-effort cleanup,
// self-skip when the Add Variable control isn't available for this role/tier.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe.serial("variable lifecycle", () => {
  test("create (multi-env, sensitive), reveal, edit value + description, clear description, duplicate-key rejection, delete", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);

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

    const key = `E2E_LIFECYCLE_${Date.now()}`;
    const initialValue = `initial-${Date.now()}`;
    const editedValue = `edited-${Date.now()}`;
    const description = `E2E description ${Date.now()}`;
    let created = false;

    try {
      // ── A. CREATE: unique key, value, multiple environments, sensitive ──
      await createVariable(page, {
        key,
        value: initialValue,
        environments: ["staging"],
        sensitive: true,
      });
      created = true;

      const row = variableRow(page, key);
      await expect(
        row,
        "created variable row should appear in the list"
      ).toBeVisible({ timeout: 20_000 });
      await expect(row.getByText(/^development$/)).toBeVisible({
        timeout: 10_000,
      });
      await expect(row.getByText(/^staging$/)).toBeVisible();
      await expect(row.getByText("Sensitive")).toBeVisible();

      // ── B. REVEAL: eye icon reveals the exact value entered at create ──
      const revealButton = row.getByTitle("Reveal value");
      await expect(revealButton).toBeVisible();
      await revealButton.click();
      await expect(row.locator("code", { hasText: initialValue })).toBeVisible({
        timeout: 15_000,
      });

      // ── C. EDIT VALUE + METADATA: change value, set a description ──
      const editButton = row.getByTitle("Edit variable");
      await expect(editButton).toBeVisible();
      await editButton.click();

      let editDrawer = page.getByRole("dialog");
      await expect(editDrawer).toBeVisible({ timeout: 10_000 });
      await expect(editDrawer).toContainText("Edit Variable");

      await expect(
        editDrawer.locator("#key"),
        "key field should be locked once the variable exists"
      ).toBeDisabled();
      await editDrawer.locator("#value").fill(editedValue);
      await editDrawer.locator("#description").fill(description);

      await editDrawer.getByRole("button", { name: "Update Variable" }).click();
      await expect(
        editDrawer,
        "edit drawer should close on success"
      ).toBeHidden({ timeout: 15_000 });

      await expect(
        row.getByText(description),
        "description should appear on the row after saving"
      ).toBeVisible({ timeout: 20_000 });

      // The value input is intentionally blanked on every edit-drawer open
      // (edit-for-security — see variable-edit-modal.tsx) and the
      // client-cached revealed value is not invalidated on edit, so the new
      // value can't be re-revealed through the list UI. Instead, force a
      // fresh reveal fetch on a brand-new page load, which bypasses the
      // in-memory revealedValues cache entirely and proves the new value
      // was actually persisted server-side (not just accepted client-side).
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: "Environment Variables" })
      ).toBeVisible({ timeout: 20_000 });
      // `row`/`editButton` are lazily-evaluated locators bound to `page`, so
      // they still resolve correctly against the reloaded DOM.
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByTitle("Reveal value").click();
      await expect(
        row.locator("code", { hasText: editedValue }),
        "reveal after reload should show the newly-saved value, proving the edit persisted"
      ).toBeVisible({ timeout: 15_000 });

      // Re-open edit and confirm the description carried over.
      await editButton.click();
      editDrawer = page.getByRole("dialog");
      await expect(editDrawer).toBeVisible({ timeout: 10_000 });
      await expect(editDrawer.locator("#description")).toHaveValue(description);

      // ── C (cont'd): clear the description — regression test ──
      await editDrawer.locator("#description").fill("");
      await editDrawer.getByRole("button", { name: "Update Variable" }).click();
      await expect(editDrawer).toBeHidden({ timeout: 15_000 });

      await expect(
        row.getByText(description),
        "description text should be gone from the row after clearing it"
      ).toHaveCount(0, { timeout: 20_000 });

      // Re-open edit and assert the description field is genuinely empty
      // server-side (not silently retained).
      await editButton.click();
      editDrawer = page.getByRole("dialog");
      await expect(editDrawer).toBeVisible({ timeout: 10_000 });
      await expect(
        editDrawer.locator("#description"),
        "description should be truly cleared, not silently kept, after saving an empty value"
      ).toHaveValue("");
      await editDrawer.getByRole("button", { name: "Cancel" }).click();
      await expect(editDrawer).toBeHidden({ timeout: 10_000 });

      // ── D. DUPLICATE-KEY CONFLICT ──
      // This flow deliberately expects the submission to FAIL, so it can't
      // use the resilient createVariable() helper (which waits for
      // success). Only the drawer-open step is hardened against a dev-mode
      // remount tearing it down right after the click.
      const dupeDrawer = page.getByRole("dialog");
      await expect(async () => {
        if (await dupeDrawer.isVisible().catch(() => false)) return;
        await addButton.click();
        await expect(dupeDrawer).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 30_000 });

      await dupeDrawer.locator("#key").fill(key);
      await dupeDrawer.locator("#value").fill(`dupe-${Date.now()}`);
      await dupeDrawer.getByRole("button", { name: "Create Variable" }).click();

      await expect(
        dupeDrawer.getByText(/already exists/i),
        "duplicate-key create should surface a visible inline error"
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        dupeDrawer,
        "the drawer should stay open (not treat the duplicate as success)"
      ).toBeVisible();

      await expect(
        variableRow(page, key),
        "duplicate-key submission must not create a second row for the same key"
      ).toHaveCount(1);

      await dupeDrawer.getByRole("button", { name: "Cancel" }).click();
      await expect(dupeDrawer).toBeHidden({ timeout: 10_000 });

      // ── E. CLEANUP ──
      await deleteVariableByKey(page, key);
      created = false;
      await expect(variableRow(page, key)).toHaveCount(0, {
        timeout: 20_000,
      });
    } finally {
      if (created) {
        await deleteVariableByKey(page, key).catch(() => undefined);
      }
    }

    // Test D intentionally triggers a duplicate-key rejection (a real 409
    // from the Convex mutation), which the app logs via console.error
    // (structured `project_variable_create_failed` log) and the browser
    // separately reports as a failed-resource-load console message. Both are
    // expected side effects of exercising the conflict path, not a client
    // regression, so they're excluded here — anything else still fails the
    // test.
    const unexpectedErrors = clientErrors.filter(
      (text) =>
        !(
          /status of 409/.test(text) ||
          (text.includes("project_variable_create_failed") &&
            text.includes(key))
        )
    );
    expect(
      unexpectedErrors,
      `unexpected client-side errors during the variable lifecycle: ${unexpectedErrors.join("\n")}`
    ).toEqual([]);
  });
});
