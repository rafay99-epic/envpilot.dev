import fs from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  getOwnedOrgSlug,
  getWorkerProjectSlug,
  trackClientErrors,
} from "./support";

/**
 * Authenticated e2e — secondary-feature survival check after the Convex
 * usage-optimization cleanup: share links, variable tags, project export,
 * and the audit trail that should record all three.
 *
 * Each test is independent and self-skips (never fabricates a flow) when its
 * UI entry point isn't reachable — e.g. a feature gate is off for this
 * org/tier, or the signed-in role can't create variables directly. Test D
 * (audit trail) depends on markers pushed by A/B/C, so the whole describe
 * block is forced to run serially regardless of the project's global
 * `fullyParallel` setting.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe.configure({ mode: "serial" });

function uniqueKey(tag: string): string {
  return `E2E_${tag}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function uniqueTagName(): string {
  return `e2e-tag-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/**
 * Each VariableListItem row renders as `<div className="px-6 py-4">...`
 * (apps/web/src/components/variables/variable-list-item.tsx) — the same
 * class pair used for account rows in accounts.spec.ts, for the same reason:
 * it avoids matching ancestor containers that merely contain the key as a
 * text substring.
 */
function variableRow(page: Page, key: string): Locator {
  return page.locator("div.px-6.py-4").filter({ hasText: key });
}

/** Poll-and-wait visibility check for feature-gated UI that may render
 * asynchronously once a `useFeatureGate` query resolves (initial render can
 * happen before the gate settles). Returns false (never throws) so callers
 * can `test.skip()` on a clean boolean. */
async function isReachable(
  locator: Locator,
  timeoutMs = 8_000
): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/** Best-effort delete of a variable row via its title="Delete variable"
 * button + the page's ConfirmDialog. Never throws — cleanup must not mask
 * the real test result. Closes any lingering open drawer/dialog first (e.g.
 * a share drawer left stuck on an error state) so its overlay doesn't
 * intercept the click and hang the cleanup indefinitely. */
async function deleteVariable(page: Page, key: string): Promise<void> {
  await page.keyboard.press("Escape").catch(() => {});
  const overlay = page.locator("div.fixed.inset-0.z-50");
  if (
    await overlay
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    // DrawerPanel ignores Escape when preventClose is set; fall back to
    // clicking its own close ("X") button if present.
    const closeButton = overlay.first().locator("button").first();
    await closeButton.click({ timeout: 3_000 }).catch(() => {});
  }

  const row = variableRow(page, key);
  const deleteButton = row.getByTitle("Delete variable");
  if (!(await deleteButton.isVisible().catch(() => false))) return;
  await deleteButton.click();
  const confirmButton = page.getByRole("button", {
    name: "Delete",
    exact: true,
  });
  if (await confirmButton.isVisible().catch(() => false)) {
    await confirmButton.click();
    await expect(variableRow(page, key))
      .toHaveCount(0, { timeout: 20_000 })
      .catch(() => {
        // Best effort — if this races, the row will still be gone after the
        // mutation settles; not worth failing cleanup over.
      });
  }
}

// Markers written by A/B/C on successful creation, read by D to prove the
// audit trail recorded them. Populated only when the action actually
// happened (not on a self-skip), so D can itself self-skip cleanly when
// everything upstream was gated off.
const auditMarkers: string[] = [];

test.describe("sharing, tags, export — post-cleanup survival", () => {
  test("A: share link — create a variable and generate a one-time share link", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });

    const addButton = page.getByRole("button", { name: /^Add Variable/ });
    test.skip(
      !(await isReachable(addButton)),
      "Add Variable button not visible — the signed-in role may not have direct create permission (request-only flow), or a tier gate is blocking creation"
    );

    const key = uniqueKey("SHARE");
    let created = false;

    try {
      // Resilient to dev-mode React remounts tearing down the create drawer
      // mid-interaction — retries the whole open→fill→submit sequence as a
      // unit instead of failing on a detached element (this is the step that
      // flaked in the full-suite marathon run).
      await createVariable(page, {
        key,
        value: `share-value-${Date.now()}`,
      });
      created = true;
      auditMarkers.push(key);

      const row = variableRow(page, key);
      await expect(
        row,
        "created variable row should appear in the list"
      ).toBeVisible({ timeout: 20_000 });

      const shareButton = row.getByTitle("Share via secure link");
      test.skip(
        !(await isReachable(shareButton)),
        "Share button not visible — secret_sharing feature may be gated off for this org/tier"
      );

      await shareButton.click();
      const shareDrawer = page.getByRole("dialog");
      await expect(shareDrawer).toBeVisible({ timeout: 10_000 });
      await expect(shareDrawer).toContainText("Share Secret");
      await expect(shareDrawer).toContainText(key);

      // Generate & Send requires at least one recipient — use a clearly
      // external address so the backend's self-share guard never fires.
      const recipient = `share-target-${Date.now()}@example-e2e.test`;
      const emailInput = shareDrawer.locator('input[type="email"]');
      await emailInput.fill(recipient);
      await emailInput.press("Enter");
      await expect(shareDrawer.getByText(recipient)).toBeVisible();

      // Everything else (one-time mode, 24h TTL, no passphrase) is left at
      // its default per the task — "generate a link with default settings".
      await shareDrawer
        .getByRole("button", { name: "Generate & Send" })
        .click();

      // The Share button's visibility only reflects the `secret_sharing`
      // boolean gate — a separate numeric `max_active_shares` limit can
      // still reject the mutation itself (e.g. free tier ships with
      // max_active_shares=0, i.e. sharing is visible but unusable). Race
      // success against that specific failure so this reads as a tier-gate
      // skip rather than a hung/failed test.
      const successText = shareDrawer.getByText(/Share link created/);
      const limitError = shareDrawer.getByText(/Limit reached/i);
      await Promise.race([
        successText.waitFor({ state: "visible", timeout: 20_000 }),
        limitError.waitFor({ state: "visible", timeout: 20_000 }),
      ]);
      if (await limitError.isVisible().catch(() => false)) {
        const errorText = (await limitError.textContent())?.trim();
        test.skip(
          true,
          `secret_sharing is enabled but max_active_shares limits usage to zero for this org/tier (${errorText}) — the Share button is shown but unusable; see the produced audit report`
        );
      }
      await expect(
        successText,
        "share generation should succeed with default settings"
      ).toBeVisible();

      // The success view keeps the key's <code> block AND adds the URL's —
      // filter on the share-route path so the locator stays unambiguous.
      const shareUrlCode = shareDrawer
        .locator("code")
        .filter({ hasText: /\/s\// });
      await expect(shareUrlCode).toBeVisible({ timeout: 10_000 });
      const shareUrl = (await shareUrlCode.textContent())?.trim() ?? "";
      expect(
        shareUrl,
        "generated share URL should carry the one-time token and decryption-key fragment"
      ).toMatch(/\/s\/[^#]+#.+/);

      // No active-shares list to assert against here: components/variables/
      // active-shares-list.tsx exists (exported from the barrel file) but is
      // never rendered by ShareSecretDrawer or the project page — confirmed
      // by grepping every usage in apps/web/src. There is currently no
      // in-app way to view or revoke a variable share once generated.
      test.info().annotations.push({
        type: "note",
        description:
          "ActiveSharesList (apps/web/src/components/variables/active-shares-list.tsx) is dead code for variables — not wired into ShareSecretDrawer or the project page, so a generated share can't be viewed/revoked from the UI. Not asserted here; see the produced audit report.",
      });

      await shareDrawer.getByRole("button", { name: "Done" }).click();
      await expect(shareDrawer).toBeHidden({ timeout: 10_000 });
    } finally {
      if (created) await deleteVariable(page, key);
    }

    expect(
      clientErrors,
      `unexpected client-side errors on the share flow: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("B: tags — create a tag, assign it, and see the chip render", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });

    const addButton = page.getByRole("button", { name: /^Add Variable/ });
    test.skip(
      !(await isReachable(addButton)),
      "Add Variable button not visible — the signed-in role may not have direct create permission"
    );

    const key = uniqueKey("TAG");
    const tagName = uniqueTagName();
    let created = false;
    let tagCreated = false;

    try {
      await addButton.first().click();
      const createDrawer = page.getByRole("dialog");
      await expect(createDrawer).toBeVisible({ timeout: 10_000 });
      await createDrawer.locator("#key").fill(key);
      await createDrawer.locator("#value").fill(`tag-value-${Date.now()}`);

      const newTagButton = createDrawer.getByRole("button", {
        name: "New tag",
      });
      test.skip(
        !(await isReachable(newTagButton)),
        "tag UI not reachable from the variable create form — variable_tags feature may be gated off for this org/tier"
      );

      // The newly created tag reactively appears as an unselected toggle
      // chip in availableTags. The open→fill→submit sub-flow retries as a
      // unit (support.ts createVariable pattern): the drawer re-renders on
      // live query updates, and a swallowed "Add Tag" click means the
      // mutation never runs and the chip never appears. Duplicate names are
      // rejected server-side, so a retry after an unobserved success is
      // harmless — the chip check at the top short-circuits it anyway.
      const tagChip = createDrawer.getByRole("button", {
        name: tagName,
        exact: true,
      });
      await expect(async () => {
        if (await tagChip.isVisible().catch(() => false)) return;
        const nameInput = createDrawer.getByPlaceholder("Tag name");
        if (!(await nameInput.isVisible().catch(() => false))) {
          await newTagButton.click({ timeout: 5_000 });
        }
        await nameInput.fill(tagName, { timeout: 5_000 });
        await createDrawer
          .getByRole("button", { name: "Add Tag" })
          .click({ timeout: 5_000 });
        await expect(tagChip, {
          message: "newly created tag should appear as a selectable chip",
        }).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 60_000 });
      tagCreated = true;
      auditMarkers.push(tagName);
      await tagChip.click();
      await expect(
        createDrawer.locator("span").filter({ hasText: tagName }),
        "selecting the chip should move it into the selected-tags display (a TagBadge <span>, distinct from the toggle <button>)"
      ).toBeVisible({ timeout: 10_000 });

      await createDrawer
        .getByRole("button", { name: "Create Variable" })
        .click();
      await expect(
        createDrawer,
        "create drawer should close on success"
      ).toBeHidden({ timeout: 15_000 });
      created = true;
      auditMarkers.push(key);

      const row = variableRow(page, key);
      await expect(
        row,
        "created variable row should appear in the list"
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        row.locator("span").filter({ hasText: tagName }),
        "tag chip should render on the variable row"
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      if (created) await deleteVariable(page, key);

      if (tagCreated) {
        try {
          const orgSlug = await getOwnedOrgSlug(page);
          await page.goto(`/organizations/${orgSlug}/settings?tab=tags`, {
            waitUntil: "domcontentloaded",
          });
          const tagRow = page
            .locator("div.flex.items-center.gap-3.py-3")
            .filter({ hasText: tagName });
          const deleteTagButton = tagRow.getByTitle("Delete tag");
          if (
            await deleteTagButton
              .isVisible({ timeout: 10_000 })
              .catch(() => false)
          ) {
            await deleteTagButton.click();
            await tagRow
              .getByRole("button", { name: "Delete", exact: true })
              .click();
          } else {
            test.info().annotations.push({
              type: "note",
              description: `could not reach the Tags settings tab to clean up tag "${tagName}" — left behind, delete manually`,
            });
          }
        } catch {
          test.info().annotations.push({
            type: "note",
            description: `tag cleanup for "${tagName}" threw — left behind, delete manually`,
          });
        }
      }
    }

    expect(
      clientErrors,
      `unexpected client-side errors on the tags flow: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("C: export — download a .env file containing the test variable", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });

    const addButton = page.getByRole("button", { name: /^Add Variable/ });
    test.skip(
      !(await isReachable(addButton)),
      "Add Variable button not visible — the signed-in role may not have direct create permission"
    );

    const key = uniqueKey("EXPORT");
    const value = `export-value-${Date.now()}`;
    let created = false;

    try {
      // Same dev-mode-remount hardening as test A — retries the whole
      // open→fill→submit sequence as a unit.
      await createVariable(page, { key, value });
      created = true;
      auditMarkers.push(key);

      await expect(variableRow(page, key)).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: "Export", exact: true }).click();
      const exportDrawer = page.getByRole("dialog");
      await expect(exportDrawer).toBeVisible({ timeout: 10_000 });
      await expect(exportDrawer).toContainText("Export Variables");

      const exportSubmit = exportDrawer.getByRole("button", {
        name: "Export",
        exact: true,
      });
      test.skip(
        !(await isReachable(exportSubmit)),
        "Export submit button not visible — bulk_export feature may be gated off for this org/tier"
      );

      const downloadPromise = page.waitForEvent("download", {
        timeout: 20_000,
      });
      await exportSubmit.click();
      const download = await downloadPromise;

      const filePath = await download.path();
      expect(
        filePath,
        "download should save to a local temp file"
      ).not.toBeNull();
      const content = fs.readFileSync(filePath as string, "utf-8");
      expect(
        content,
        "exported file should contain the test variable's key"
      ).toContain(key);
      expect(
        content,
        "exported file should contain the test variable's plaintext value"
      ).toContain(value);

      await exportDrawer.getByRole("button", { name: "Cancel" }).click();
      await expect(exportDrawer).toBeHidden({ timeout: 10_000 });
    } finally {
      if (created) await deleteVariable(page, key);
    }

    expect(
      clientErrors,
      `unexpected client-side errors on the export flow: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("D: audit trail — recent entries reference the test artifacts", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    test.skip(
      auditMarkers.length === 0,
      "no share/tag/export actions completed upstream (all self-skipped) — nothing to verify in the audit trail"
    );

    await page.goto("/dashboard/audit", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible(
      { timeout: 20_000 }
    );

    // Loose, existence-only check: any one of the unique keys/tag names
    // created above showing up proves audit writes survived the cleanup —
    // exact copy/formatting is not the point here. The heading above renders
    // immediately (static JSX from RequireRole resolving), but the log rows
    // themselves stream in afterwards over the Convex websocket subscription
    // — a single auto-retrying assertion (rather than a one-shot
    // `isVisible()`, which Playwright documents as never waiting) gives that
    // subscription time to settle.
    const combinedPattern = new RegExp(
      auditMarkers
        .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")
    );
    await expect(
      page.getByText(combinedPattern).first(),
      `expected at least one of [${auditMarkers.join(", ")}] to appear on the audit log's first page — audit writes may not have survived the Convex cleanup`
    ).toBeVisible({ timeout: 30_000 });
  });
});
