import { expect, test, type Locator, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getFirstProjectSlug, trackClientErrors } from "./support";

// Authenticated e2e — Shared Accounts (PLAN.md Slice C). Exercises the full
// lifecycle against a real project: nav visibility, page load, create via
// the drawer, reveal, edit, share drawer (both modes), and delete via
// ConfirmDialog. Everything lives in a single serial test so the created
// account can be threaded through each step and reliably cleaned up in a
// `finally` block — even if an assertion partway through fails, the account
// is still deleted at the end (never leaves stray rows in the shared test
// project). Mutates real data (creates + deletes one account), unlike the
// read-only project-members-drawer spec.

test.skip(!hasE2ECredentials, SKIP_REASON);

/**
 * Each AccountListItem row renders as `<div className="px-6 py-4">...`
 * (apps/web/src/components/accounts/account-list-item.tsx). Scoping on that
 * class pair (rather than a bare `div` filtered by text) avoids matching
 * ancestor containers that also happen to contain the account name as a
 * text-content substring (e.g. the list header's "Accounts" / "Add Account"
 * button share the "px-6 py-4" utility classes too, but never the full
 * unique, timestamped account name used in this spec).
 */
function accountRow(page: Page, name: string): Locator {
  return page.locator("div.px-6.py-4").filter({ hasText: name });
}

test.describe("shared accounts", () => {
  test("nav item, page load, create, reveal, edit, share, delete", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getFirstProjectSlug(page);
    test.skip(
      slug === null,
      "the owned org has no projects yet — nothing to exercise the Accounts feature against"
    );

    // ── Nav item visible on a project ──
    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    const accountsNavLink = page.locator(
      `a[href="/dashboard/projects/${slug}/accounts"]`
    );
    await expect(
      accountsNavLink.first(),
      "Accounts nav item should be visible in the project sidebar"
    ).toBeVisible({ timeout: 20_000 });

    // ── Page loads with header ──
    // Clicking immediately after load can race Next.js hydration (the Link
    // handler isn't attached yet, so the click is swallowed) — retry the
    // click until the navigation actually happens. Same pattern as the
    // project-create flow in search-projects-org.spec.ts.
    await expect(async () => {
      await accountsNavLink.first().click();
      await page.waitForURL(
        new RegExp(`/dashboard/projects/${slug}/accounts$`),
        { timeout: 5_000 }
      );
    }).toPass({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Accounts" })
    ).toBeVisible({ timeout: 20_000 });

    // The feature can be gated off for this tier/org — if so there is no
    // "Add Account" button to drive the rest of the spec. Treat that as a
    // skip (structural page load is already verified above), not a failure.
    const addButton = page.getByRole("button", { name: "Add Account" });
    const hasAddButton = await addButton.isVisible().catch(() => false);
    test.skip(
      !hasAddButton,
      "Add Account button not visible — shared_accounts feature may be gated off for this org/tier, or the signed-in role cannot create accounts"
    );

    const accountName = `E2E Account ${Date.now()}`;
    const editedName = `${accountName} (edited)`;
    const username = `svc-${Date.now()}@example.com`;
    const password = `Password-${Date.now()}!`;
    let created = false;

    try {
      // ── Create an account via the drawer ──
      // Retried as a unit — the same principle as support.ts's
      // createVariable(): a dev-mode React remount can detach the drawer
      // mid-fill, so the whole open→fill→submit sequence is replayed
      // (reopening + refilling) rather than failing on a stale element. The
      // top-of-loop guard makes a retry a no-op once the row has actually
      // landed, even if the drawer-hidden observation itself got interrupted.
      const row = accountRow(page, accountName);
      await expect(async () => {
        if (
          await row
            .first()
            .isVisible()
            .catch(() => false)
        )
          return;

        const createDrawer = page.getByRole("dialog");
        if (!(await createDrawer.isVisible().catch(() => false))) {
          await addButton.click();
          await expect(createDrawer).toBeVisible({ timeout: 10_000 });
        }
        await expect(createDrawer).toContainText("Add Account");

        await createDrawer.locator("#account-name").fill(accountName);
        await createDrawer
          .locator("#account-url")
          .fill("https://dashboard.example.com");
        await createDrawer.locator("#account-username").fill(username);
        await createDrawer.locator("#account-password").fill(password);
        // Environments default to ["development"] pre-selected — leave as is.

        await createDrawer
          .getByRole("button", { name: "Create Account" })
          .click();
        await expect(
          createDrawer,
          "create drawer should close on success"
        ).toBeHidden({ timeout: 15_000 });
        await expect(
          row.first(),
          "created account row should appear in the list"
        ).toBeVisible({ timeout: 15_000 });
      }).toPass({ timeout: 60_000 });
      created = true;

      // ── Row appears with env pills ──
      await expect(row.getByText(/^development$/)).toBeVisible({
        timeout: 10_000,
      });

      // ── Reveal shows username + password ──
      // Retried as a unit too: reveal is a plain click (no dialog), but a
      // remount resets the row's local `isValueVisible` state, so a retry
      // just re-clicks rather than hanging on a detached button.
      await expect(async () => {
        if (
          !(await row
            .getByText("Username")
            .isVisible()
            .catch(() => false))
        ) {
          const revealButton = row.getByTitle("Reveal credentials");
          await expect(revealButton).toBeVisible();
          await revealButton.click();
        }
        await expect(row.getByText("Username")).toBeVisible({
          timeout: 15_000,
        });
        await expect(row.getByText("Password")).toBeVisible();
        // Username is shown in the clear; password starts masked, so assert
        // the plaintext username round-tripped through create -> vault ->
        // reveal.
        await expect(row.locator("code", { hasText: username })).toBeVisible({
          timeout: 10_000,
        });
      }).toPass({ timeout: 30_000 });

      // ── Edit the name ──
      const updatedRow = accountRow(page, editedName);
      await expect(async () => {
        if (
          await updatedRow
            .first()
            .isVisible()
            .catch(() => false)
        )
          return;

        const editDrawer = page.getByRole("dialog");
        if (!(await editDrawer.isVisible().catch(() => false))) {
          const editButton = row.getByTitle("Edit account");
          await expect(editButton).toBeVisible();
          await editButton.click();
          await expect(editDrawer).toBeVisible({ timeout: 10_000 });
        }
        await expect(editDrawer).toContainText("Edit Account");

        const nameInput = editDrawer.locator("#account-name");
        await expect(nameInput).toHaveValue(accountName);
        await nameInput.fill(editedName);

        await editDrawer.getByRole("button", { name: "Save Changes" }).click();
        await expect(
          editDrawer,
          "edit drawer should close on success"
        ).toBeHidden({ timeout: 15_000 });
        await expect(
          updatedRow.first(),
          "row should reflect the updated name"
        ).toBeVisible({ timeout: 15_000 });
      }).toPass({ timeout: 60_000 });

      // ── Open the share drawer and assert both modes render ──
      const shareButton = updatedRow.getByTitle("Share account");
      await expect(shareButton).toBeVisible();
      await shareButton.click();

      const shareDrawer = page.getByRole("dialog");
      await expect(shareDrawer).toBeVisible({ timeout: 10_000 });
      await expect(shareDrawer).toContainText("Share Account");

      // The Share button opens directly on the external-link tab, which shows
      // its recipient/generate UI immediately.
      await expect(
        shareDrawer.getByRole("button", { name: "Team member" })
      ).toBeVisible();
      await expect(
        shareDrawer.getByRole("button", { name: "External link" })
      ).toBeVisible();
      await expect(shareDrawer.getByText("Recipient Emails")).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        shareDrawer.getByRole("button", { name: "Generate & Send" })
      ).toBeVisible();

      // Team member mode renders its grant UI when selected.
      await shareDrawer.getByRole("button", { name: "Team member" }).click();
      await expect(
        shareDrawer.getByRole("button", { name: "Grant access" })
      ).toBeVisible({ timeout: 10_000 });

      // Back to the external tab and close without generating a link (no email
      // delivery in this spec).
      await shareDrawer.getByRole("button", { name: "External link" }).click();
      await shareDrawer.getByRole("button", { name: "Cancel" }).click();
      await expect(shareDrawer).toBeHidden({ timeout: 10_000 });

      // ── Delete via ConfirmDialog ──
      // Retried as a unit — a remount between opening the ConfirmDialog and
      // clicking its Delete button would otherwise surface as a detached-
      // element actionability timeout. The top-of-loop guard makes a retry a
      // no-op once the row is actually gone, so the destructive click never
      // fires twice.
      await expect(async () => {
        if ((await updatedRow.count()) === 0) return;

        const confirmDialogHeading = page.getByRole("heading", {
          name: "Delete Account",
        });
        if (!(await confirmDialogHeading.isVisible().catch(() => false))) {
          const deleteButton = updatedRow.getByTitle("Delete account");
          await expect(deleteButton).toBeVisible();
          await deleteButton.click();
          await expect(confirmDialogHeading).toBeVisible({ timeout: 10_000 });
        }
        // Assert against the full confirmation sentence (not just the bare
        // account name) — `editedName` alone also matches the account row's
        // name span still visible behind the modal (ConfirmDialog's `Modal`
        // has no `role="dialog"` to scope against), which is a Playwright
        // strict-mode violation (2 matching elements).
        await expect(
          page.getByText(`delete "${editedName}"`, { exact: false })
        ).toBeVisible();

        await page.getByRole("button", { name: "Delete", exact: true }).click();
        await expect(confirmDialogHeading).toBeHidden({ timeout: 15_000 });
        await expect(
          updatedRow,
          "deleted account row should no longer be present"
        ).toHaveCount(0, { timeout: 15_000 });
      }).toPass({ timeout: 60_000 });
      created = false;
    } finally {
      // Best-effort cleanup: if any assertion above threw before the delete
      // step completed, make sure the account doesn't linger in the shared
      // test project. Tries both possible names (pre- and post-edit).
      if (created) {
        for (const candidateName of [editedName, accountName]) {
          const candidateRow = accountRow(page, candidateName);
          const cleanupDeleteButton = candidateRow.getByTitle("Delete account");
          if (await cleanupDeleteButton.isVisible().catch(() => false)) {
            await cleanupDeleteButton.click();
            const confirmDeleteButton = page.getByRole("button", {
              name: "Delete",
              exact: true,
            });
            if (await confirmDeleteButton.isVisible().catch(() => false)) {
              await confirmDeleteButton.click();
            }
            break;
          }
        }
      }
    }

    expect(
      clientErrors,
      `unexpected client-side errors on the accounts page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
