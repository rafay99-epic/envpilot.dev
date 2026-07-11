import { expect, test, type Locator, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getWorkerProjectSlug,
  trackClientErrors,
  variableRow,
} from "./support";

// Authenticated e2e — soft-delete / trash / restore for variables and shared
// accounts (7-day retention window shipped alongside RecentlyDeleted, see
// apps/web/src/components/variables/recently-deleted.tsx). Runs against this
// worker's own fixture project (getWorkerProjectSlug); tests stay serial
// (test.describe.serial) because they share that project's trash state with
// each other — under fullyParallel, non-serial tests in one file can land on
// different workers.
//
// The worker project still accumulates soft-deleted rows across runs (this
// file's own tests leave their cleanup deletes behind — deleting no longer
// purges immediately, it just re-enters the trash, and trash entries persist
// for 7 days). That makes "the trash is empty" an assumption we can't force,
// so the empty-trash test tolerates a non-empty trash left over from prior
// runs by skipping with an explanation, mirroring the tolerant-skip pattern
// used in variables-pagination.spec.ts for "Load more".

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe.serial("trash & restore", () => {
  function accountRow(page: Page, name: string): Locator {
    return page.locator("div.px-6.py-4").filter({ hasText: name });
  }

  /**
   * Each trash-page row (variable or account) renders as
   * `<div className="flex items-center justify-between gap-4 px-6 py-3">`
   * (app/(dashboard)/dashboard/projects/[slug]/trash/page.tsx). That class
   * pair is otherwise unused on the page, so scoping on it (mirroring the
   * accountRow/variableRow `div.px-6.py-N` pattern above) reliably picks the
   * single row div — not an inner wrapper that lacks the Restore button, and
   * not an outer ancestor that matches several rows.
   */
  function trashRow(page: Page, text: string): Locator {
    return page.locator("div.px-6.py-3").filter({ hasText: text });
  }

  /** Navigate to the project's dedicated trash page and wait for it. */
  async function gotoTrash(page: Page, slug: string) {
    await page.goto(`/dashboard/projects/${slug}/trash`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Trash" })
    ).toBeVisible({ timeout: 20_000 });
  }

  test("trash page: empty state or existing debris renders without errors", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);
    await gotoTrash(page, slug);

    // Either the positive empty state or at least one trash section renders —
    // debris from other specs/runs may legitimately be present (7-day window).
    await expect(
      page
        .getByRole("heading", { name: "Trash is empty" })
        .or(page.getByRole("heading", { name: /Variables|Shared accounts/ }))
        .first()
    ).toBeVisible({ timeout: 20_000 });

    expect(
      clientErrors,
      `client errors on the trash page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("variable trash round-trip: delete, appears in trash, restore", async ({
    page,
  }) => {
    test.setTimeout(90_000);
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

    const key = `E2E_TRASH_${Date.now()}`;
    let created = false;

    try {
      // ── Create the variable via the drawer ──
      // Environments default to ["development"] pre-selected — leave as is.
      await createVariable(page, { key, value: `value-${Date.now()}` });
      created = true;

      const row = variableRow(page, key);
      await expect(
        row,
        "created variable row should appear in the list"
      ).toBeVisible({ timeout: 20_000 });

      // ── Delete via ConfirmDialog — assert the new 7-day-restore copy ──
      const deleteButton = row.getByTitle("Delete variable");
      await expect(deleteButton).toBeVisible();
      await deleteButton.click();

      const confirmHeading = page.getByRole("heading", {
        name: "Delete Variable",
      });
      await expect(confirmHeading).toBeVisible({ timeout: 10_000 });
      const dialogMessage = page.getByText(`delete "${key}"`, {
        exact: false,
      });
      await expect(dialogMessage).toBeVisible();
      await expect(dialogMessage).toContainText(/restore it for 7 days/i);
      await expect(
        page.getByText(/cannot be undone/i),
        "old irreversible-delete copy should not appear in the restore-window dialog"
      ).toHaveCount(0);

      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirmHeading).toBeHidden({ timeout: 15_000 });

      await expect(
        variableRow(page, key),
        "deleted variable row should no longer be present in the active list"
      ).toHaveCount(0, { timeout: 20_000 });

      // ── Trash page lists it with a days-left label ──
      await gotoTrash(page, slug);
      const variableTrashRow = trashRow(page, key);
      await expect(variableTrashRow).toBeVisible({ timeout: 20_000 });
      await expect(variableTrashRow).toContainText(/deleted \d+ days? ago/i);
      await expect(variableTrashRow).toContainText(/\d+ days? left/i);

      // ── Restore: item leaves the trash list + reappears in the normal
      // list. The sonner toast is ephemeral (~4s) and a dev-mode remount can
      // unmount the toaster before the assertion samples it, so accept
      // either success signal — the durable reappearance check follows.
      await variableTrashRow.getByRole("button", { name: "Restore" }).click();
      await expect
        .poll(
          async () => {
            const toastVisible = await page
              .locator("[data-sonner-toaster]")
              .getByText(`Restored ${key}`)
              .isVisible()
              .catch(() => false);
            const rowGone = (await variableTrashRow.count()) === 0;
            return toastVisible || rowGone;
          },
          {
            message:
              "restore should surface the success toast or remove the row from the trash list",
            timeout: 15_000,
          }
        )
        .toBe(true);

      // Back on the project page, the restored variable is in the active list.
      await page.goto(`/dashboard/projects/${slug}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        variableRow(page, key),
        "restored variable should reappear in the active list"
      ).toBeVisible({ timeout: 20_000 });

      // ── Clean up: delete it again so reruns start from a clean list ──
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

    expect(
      clientErrors,
      `unexpected client-side errors during the variable trash round-trip: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("shared account trash round-trip: delete, appears in trash, restore", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${slug}/accounts`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Accounts" })
    ).toBeVisible({ timeout: 20_000 });

    const addButton = page.getByRole("button", { name: "Add Account" });
    const hasAddButton = await addButton.isVisible().catch(() => false);
    test.skip(
      !hasAddButton,
      "Add Account button not visible — shared_accounts feature may be gated off for this org/tier, or the signed-in role cannot create accounts"
    );

    const accountName = `E2E Trash Account ${Date.now()}`;
    let created = false;

    try {
      // ── Create via the drawer ──
      await addButton.click();
      const createDrawer = page.getByRole("dialog");
      await expect(createDrawer).toBeVisible({ timeout: 10_000 });
      await expect(createDrawer).toContainText("Add Account");

      await createDrawer.locator("#account-name").fill(accountName);
      await createDrawer
        .locator("#account-url")
        .fill("https://dashboard.example.com");
      await createDrawer
        .locator("#account-username")
        .fill(`svc-${Date.now()}@example.com`);
      await createDrawer
        .locator("#account-password")
        .fill(`Password-${Date.now()}!`);

      await createDrawer
        .getByRole("button", { name: "Create Account" })
        .click();
      await expect(
        createDrawer,
        "create drawer should close on success"
      ).toBeHidden({ timeout: 15_000 });
      created = true;

      const row = accountRow(page, accountName);
      await expect(
        row,
        "created account row should appear in the list"
      ).toBeVisible({ timeout: 20_000 });

      // ── Delete via ConfirmDialog — assert the new 7-day-restore copy (test D) ──
      const deleteButton = row.getByTitle("Delete account");
      await expect(deleteButton).toBeVisible();
      await deleteButton.click();

      const confirmHeading = page.getByRole("heading", {
        name: "Delete Account",
      });
      await expect(confirmHeading).toBeVisible({ timeout: 10_000 });
      const dialogMessage = page.getByText(`delete "${accountName}"`, {
        exact: false,
      });
      await expect(dialogMessage).toBeVisible();
      await expect(dialogMessage).toContainText(/restore it for 7 days/i);
      await expect(
        page.getByText(/cannot be undone/i),
        "old irreversible-delete copy should not appear in the restore-window dialog"
      ).toHaveCount(0);

      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirmHeading).toBeHidden({ timeout: 15_000 });

      await expect(
        accountRow(page, accountName),
        "deleted account row should no longer be present in the active list"
      ).toHaveCount(0, { timeout: 20_000 });

      // ── Trash lives on its own page now ──
      await gotoTrash(page, slug);
      const accountTrashRow = trashRow(page, accountName);
      await expect(accountTrashRow).toBeVisible({ timeout: 20_000 });
      await expect(accountTrashRow).toContainText(/deleted \d+ days? ago/i);
      await expect(accountTrashRow).toContainText(/\d+ days? left/i);

      // ── Restore: row leaves the trash list, then confirm it's back on
      // /accounts. Same ephemeral-toast tolerance as the variable round-trip
      // above (a remount can unmount the toaster before we sample it).
      await accountTrashRow.getByRole("button", { name: "Restore" }).click();
      await expect
        .poll(
          async () => {
            const toastVisible = await page
              .locator("[data-sonner-toaster]")
              .getByText(`Restored ${accountName}`)
              .isVisible()
              .catch(() => false);
            const rowGone = (await accountTrashRow.count()) === 0;
            return toastVisible || rowGone;
          },
          {
            message:
              "restore should surface the success toast or remove the row from the trash list",
            timeout: 15_000,
          }
        )
        .toBe(true);

      await page.goto(`/dashboard/projects/${slug}/accounts`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        accountRow(page, accountName),
        "restored account should reappear in the accounts list"
      ).toBeVisible({ timeout: 20_000 });

      // ── Clean up: delete it again so reruns start from a clean list ──
      const restoredRow = accountRow(page, accountName);
      await restoredRow.getByTitle("Delete account").click();
      const cleanupConfirmHeading = page.getByRole("heading", {
        name: "Delete Account",
      });
      await expect(cleanupConfirmHeading).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(cleanupConfirmHeading).toBeHidden({ timeout: 15_000 });
      created = false;
      await expect(accountRow(page, accountName)).toHaveCount(0, {
        timeout: 20_000,
      });
    } finally {
      if (created) {
        // Best-effort cleanup: it may currently be sitting on /accounts (never
        // deleted) or already restored there — either way /accounts is where
        // the delete control lives.
        await page
          .goto(`/dashboard/projects/${slug}/accounts`, {
            waitUntil: "domcontentloaded",
          })
          .catch(() => undefined);
        const cleanupRow = accountRow(page, accountName);
        const cleanupDeleteButton = cleanupRow.getByTitle("Delete account");
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
      `unexpected client-side errors during the account trash round-trip: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("empty trash permanently deletes a trashed variable", async ({
    page,
  }) => {
    test.setTimeout(90_000);
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

    // Seed the trash with one variable (create + soft-delete).
    const key = `E2E_EMPTY_TRASH_${Date.now()}`;
    await createVariable(page, { key, value: `value-${Date.now()}` });
    await deleteVariableByKey(page, key);
    await expect(variableRow(page, key)).toHaveCount(0, { timeout: 20_000 });

    await gotoTrash(page, slug);
    await expect(trashRow(page, key)).toBeVisible({ timeout: 20_000 });

    // Empty the trash through the danger button + ConfirmDialog. This is the
    // worker's OWN fixture project, so purging any leftover debris from
    // earlier tests in this serial file is safe.
    const emptyButton = page.getByRole("button", { name: "Empty trash" });
    test.skip(
      !(await emptyButton.isVisible().catch(() => false)),
      "Empty trash button not visible — the signed-in role cannot purge on this project"
    );
    await emptyButton.click();

    const confirmHeading = page.getByRole("heading", { name: "Empty Trash" });
    await expect(confirmHeading).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/cannot be undone/i)).toBeVisible();
    await page
      .getByRole("button", { name: "Empty trash", exact: true })
      .last()
      .click();
    await expect(confirmHeading).toBeHidden({ timeout: 15_000 });

    // The purge destroys Vault objects then rows — allow it a moment, then
    // the page's reactive queries must converge on the empty state.
    await expect(trashRow(page, key)).toHaveCount(0, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Trash is empty" })
    ).toBeVisible({ timeout: 30_000 });

    // Permanently gone: not in the active list either.
    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Environment Variables" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(variableRow(page, key)).toHaveCount(0, { timeout: 20_000 });

    expect(
      clientErrors,
      `unexpected client-side errors during empty-trash: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
