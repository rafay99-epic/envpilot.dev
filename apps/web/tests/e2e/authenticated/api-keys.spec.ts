import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  getOwnedOrgSlug,
  getWorkerProjectSlug,
  trackClientErrors,
} from "./support";

// Authenticated e2e — API keys end to end: create a project-scoped key
// through the real org settings UI, verify it appears in the list with its
// scope badges, then revoke it inline and confirm the Revoked badge.
//
// REST endpoint behavior (the actual /api/v1/* pull) is covered in a later
// phase's specs — this spec is UI + key lifecycle only.
//
// Serial: the revoke test consumes the key created by the first test.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe.serial("API keys", () => {
  const keyName = `E2E API Key ${Date.now()}`;
  let projectSlug = "";

  test("create a project-scoped key via org settings", async ({ page }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    const orgSlug = await getOwnedOrgSlug(page);
    projectSlug = await getWorkerProjectSlug(page);

    await page.goto(`/organizations/${orgSlug}/settings`, {
      waitUntil: "domcontentloaded",
    });

    // Settings tabs render after the org + auth context resolve — wait for a
    // stable anchor before sampling for the tier-gated API Keys tab.
    await expect(
      page.getByRole("button", { name: /^General$/i }).first()
    ).toBeVisible({ timeout: 20_000 });

    const apiKeysTab = page
      .getByRole("button", { name: /^API Keys$/i })
      .first();
    const tabVisible = await apiKeysTab
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !tabVisible,
      "API Keys tab not visible — public_api is gated off for this org/tier"
    );
    await apiKeysTab.click();

    await page.getByRole("button", { name: /^New Key$/i }).click();

    // The create panel is inline — no dialog. It expands in place above the
    // key list.
    const nameInput = page.locator("#api-key-name");
    await expect(
      nameInput,
      "inline create panel should be visible"
    ).toBeVisible({ timeout: 10_000 });
    await nameInput.fill(keyName);

    // Projects: default mode is "Specific projects" — check this worker's
    // fixture project.
    const projectCheckbox = page
      .getByTestId(`api-key-project-${projectSlug}`)
      .locator('input[type="checkbox"]');
    await expect(
      projectCheckbox,
      "fixture project should be listed in the project picker"
    ).toBeVisible({ timeout: 10_000 });
    await projectCheckbox.check();

    // Environments: production is the pre-selected recommended default chip
    // — assert, don't click.
    const productionChip = page.getByRole("button", {
      name: /^production$/i,
      pressed: true,
    });
    await expect(productionChip).toBeVisible();

    // Resources: variables + projects are the pre-selected defaults —
    // projects because the default surfaces include the MCP server, whose
    // clients start by listing projects.
    const variablesChip = page.getByRole("button", {
      name: /^variables$/i,
      pressed: true,
    });
    await expect(variablesChip).toBeVisible();
    await expect(page.getByTestId("api-key-resource-projects")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Surfaces: REST API + MCP server are the pre-selected defaults —
    // assert; GitHub Action is opt-in.
    await expect(page.getByTestId("api-key-surface-rest_api")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(
      page.getByTestId("api-key-surface-mcp_server")
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByTestId("api-key-surface-github_action")
    ).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: /^Create Key$/i }).click();

    // Immediate, unambiguous feedback that the create succeeded (a sonner
    // toast) — asserted first, while it is freshest, before the reveal.
    await expect(
      page.locator("[data-sonner-toaster]").getByText(/created/i),
      "a success toast should confirm the key was created"
    ).toBeVisible({ timeout: 10_000 });

    // One-time reveal swaps the panel in place: the plaintext appears
    // exactly once.
    const keyCode = page.locator("code", { hasText: /^envpk_[0-9a-f]+$/ });
    await expect(keyCode, "plaintext key should be revealed").toBeVisible({
      timeout: 20_000,
    });
    const plaintextKey = (await keyCode.textContent())?.trim() ?? "";
    expect(plaintextKey).toMatch(/^envpk_[0-9a-f]{40}$/);

    await page.getByRole("button", { name: /^Done$/i }).click();

    // The list shows the key with its scope badges; the hash never appears.
    const row = page
      .getByTestId("api-keys-list")
      .locator("li")
      .filter({ hasText: keyName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    // Scope renders as one quiet line, not a badge per datum.
    await expect(
      row.getByText(
        /1 project · production · variables, projects · REST API, MCP server/
      )
    ).toBeVisible();

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("revoking the key marks it Revoked", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!projectSlug, "no key from the create test");

    const orgSlug = await getOwnedOrgSlug(page);
    await page.goto(`/organizations/${orgSlug}/settings`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: /^API Keys$/i })
      .first()
      .click();

    const row = page
      .getByTestId("api-keys-list")
      .locator("li")
      .filter({ hasText: keyName });
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole("button", { name: /^Revoke$/i }).click();

    // Inline confirm strip swaps in *within the row* — no ConfirmDialog.
    await expect(
      row.getByText(/Revoke this key\? Anything using it will stop working/i)
    ).toBeVisible({ timeout: 10_000 });
    await row.getByRole("button", { name: /^Revoke$/i }).click();

    await expect(row.getByText(/Revoked/i)).toBeVisible({ timeout: 15_000 });
  });

  test("custom expiry via the themed date picker (no native calendar)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const expiringKeyName = `E2E API Key expiry ${Date.now()}`;

    const orgSlug = await getOwnedOrgSlug(page);
    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/organizations/${orgSlug}/settings`, {
      waitUntil: "domcontentloaded",
    });
    const apiKeysTab = page
      .getByRole("button", { name: /^API Keys$/i })
      .first();
    const tabVisible = await apiKeysTab
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!tabVisible, "API Keys tab not visible — public_api gated off");
    await apiKeysTab.click();

    await page.getByRole("button", { name: /^New Key$/i }).click();
    await page.locator("#api-key-name").fill(expiringKeyName);
    await page
      .getByTestId(`api-key-project-${slug}`)
      .locator('input[type="checkbox"]')
      .check();

    // Custom date reveals the THEMED picker — a dialog popover, never the
    // browser's native `<input type=date>` chrome.
    await page.getByRole("button", { name: /^Custom date$/i }).click();
    const pickerTrigger = page.locator("#api-key-expiry-custom");
    await expect(pickerTrigger).toBeVisible();
    // It is a button opening a role=dialog — not a native date input.
    await expect(pickerTrigger).toHaveJSProperty("tagName", "BUTTON");
    await pickerTrigger.click();

    const calendar = page.getByRole("dialog", { name: /choose a date/i });
    await expect(calendar).toBeVisible({ timeout: 10_000 });
    // Advance a month so the 15th is unambiguously selectable (after the
    // tomorrow-minimum) and never a disabled/spillover cell.
    await calendar.getByRole("button", { name: /next month/i }).click();
    await calendar.getByRole("button", { name: "15", exact: true }).click();
    await expect(calendar).toBeHidden();
    await expect(pickerTrigger).toContainText("15");

    await page.getByRole("button", { name: /^Create Key$/i }).click();
    await expect(
      page.locator("[data-sonner-toaster]").getByText(/created/i)
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /^Done$/i }).click();

    // The row carries an expiry countdown badge from the picked date.
    const row = page
      .getByTestId("api-keys-list")
      .locator("li")
      .filter({ hasText: expiringKeyName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText(/expires in \d+d/i)).toBeVisible();

    // Self-clean: revoke so the key list doesn't accumulate across runs.
    await row.getByRole("button", { name: /^Revoke$/i }).click();
    await row.getByRole("button", { name: /^Revoke$/i }).click();
    await expect(row.getByText(/Revoked/i)).toBeVisible({ timeout: 15_000 });
  });
});
