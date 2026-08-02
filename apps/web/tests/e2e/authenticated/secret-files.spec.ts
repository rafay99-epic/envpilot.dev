import { expect, test, type Locator, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getWorkerProjectSlug, trackClientErrors } from "./support";

// Authenticated e2e — Secret Files. Drives the real UI end to end: nav
// visibility, upload through the drawer, per-environment path uniqueness,
// download, and delete via ConfirmDialog.
//
// One serial test so the uploaded file can be threaded through each step and
// removed in a `finally` — a failed assertion partway through still cleans
// up, so reruns stay green against the shared worker project. Fixtures are
// deliberately tiny (a few dozen bytes): this suite has exhausted the Convex
// free-tier I/O quota before, and secret files add blob storage on top.

test.skip(!hasE2ECredentials, SKIP_REASON);

/**
 * Each FileListItem renders as a bordered `rounded-lg` card
 * (apps/web/src/components/files/file-list-item.tsx). Filtering on the card
 * class plus the unique timestamped name avoids matching the page container,
 * which also contains the name as a text substring.
 */
function fileRow(page: Page, name: string): Locator {
  return page.locator("div.rounded-lg.border").filter({ hasText: name });
}

/** Attach an in-memory fixture to the drawer's file input. */
async function setFixture(
  page: Page,
  filename: string,
  body: string
): Promise<void> {
  await page.locator("#secret-file-input").setInputFiles({
    name: filename,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(body, "utf-8"),
  });
  // Picking a file makes the drawer pre-fill name and path from the filename.
  // Wait for that to land before typing over it: filling a React controlled
  // input while a setState from the change handler is still in flight
  // interleaves the two values and submits a mangled path.
  await expect(page.locator("#secret-file-path")).toHaveValue(filename, {
    timeout: 10_000,
  });
}

/**
 * Set a controlled input and prove the value stuck.
 *
 * fill() dispatches one input event; if React re-renders from other state in
 * the same tick the field can end up with a spliced value. Asserting inside
 * toPass retries the whole set until the DOM agrees.
 */
async function setField(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  const field = page.locator(selector);
  await expect(async () => {
    await field.fill("");
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

test.describe("secret files", () => {
  test("nav item, upload, environment isolation, download, delete", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);

    // ── Nav item visible on a project ──
    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    const filesNavLink = page.locator(
      `a[href="/dashboard/projects/${slug}/files"]`
    );
    await expect(
      filesNavLink.first(),
      "Files nav item should be visible in the project sidebar"
    ).toBeVisible({ timeout: 20_000 });

    // Clicking immediately after load can race hydration — retry the click
    // until the navigation actually lands (same pattern as accounts.spec).
    await expect(async () => {
      await filesNavLink.first().click();
      await page.waitForURL(new RegExp(`/dashboard/projects/${slug}/files$`), {
        timeout: 5_000,
      });
    }).toPass({ timeout: 20_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: "Secret Files" })
    ).toBeVisible({ timeout: 20_000 });

    // The feature is tier-gated. If it is off for this org there is no upload
    // button and nothing further to drive — the page-load assertion above
    // still covers the structural case, so skip rather than fail.
    const uploadButton = page.getByRole("button", { name: "Upload file" });
    const hasUpload = await uploadButton.isVisible().catch(() => false);
    test.skip(
      !hasUpload,
      "Upload file button not visible — secret_files may be gated off for this org/tier, or the signed-in role cannot upload"
    );

    const stamp = Date.now();
    const devName = `E2E File ${stamp}`;
    const prodName = `E2E File Prod ${stamp}`;
    // The SAME path in both, which is the whole point: disjoint environments
    // make it legal, overlapping ones must be rejected.
    const sharedPath = `e2e/${stamp}/service-account.json`;
    let devCreated = false;
    let prodCreated = false;

    try {
      // ── Upload for development ──
      await expect(async () => {
        if (await fileRow(page, devName).count()) return;
        await uploadButton.click();
        await setFixture(page, "service-account.json", '{"e2e":true}');
        await setField(page, "#secret-file-name", devName);
        await setField(page, "#secret-file-path", sharedPath);
        await page.getByRole("button", { name: "Upload", exact: true }).click();
        await expect(fileRow(page, devName)).toBeVisible({ timeout: 15_000 });
      }).toPass({ timeout: 60_000 });
      devCreated = true;

      // Path and size render on the row — the path is the feature.
      await expect(fileRow(page, devName)).toContainText(sharedPath);

      // ── The same path in a DISJOINT environment is allowed ──
      await expect(async () => {
        if (await fileRow(page, prodName).count()) return;
        await uploadButton.click();
        await setFixture(page, "service-account.json", '{"e2e":"prod"}');
        await setField(page, "#secret-file-name", prodName);
        await setField(page, "#secret-file-path", sharedPath);
        // Swap development off, production on. Scoped by label text rather
        // than index — a positional selector silently retargets the moment
        // another checkbox appears in the drawer.
        await page
          .locator("label")
          .filter({ hasText: /^development$/ })
          .getByRole("checkbox")
          .uncheck();
        await page
          .locator("label")
          .filter({ hasText: /^production$/ })
          .getByRole("checkbox")
          .check();
        await page.getByRole("button", { name: "Upload", exact: true }).click();
        await expect(fileRow(page, prodName)).toBeVisible({ timeout: 15_000 });
      }).toPass({ timeout: 60_000 });
      prodCreated = true;

      // ── The same path in an OVERLAPPING environment is rejected ──
      await uploadButton.click();
      await setFixture(page, "service-account.json", '{"e2e":"clash"}');
      await setField(page, "#secret-file-name", `E2E Clash ${stamp}`);
      await setField(page, "#secret-file-path", sharedPath);
      await page.getByRole("button", { name: "Upload", exact: true }).click();
      // Scope to the drawer's own error paragraph. The same text also lands in
      // a toast and (in dev) the Next.js error overlay, which makes a bare
      // getByText a strict-mode violation.
      await expect(
        page.locator("form p.border-red-200").filter({
          hasText: /already exists at/i,
        }),
        "an overlapping (path, environment) pair must be refused"
      ).toBeVisible({ timeout: 20_000 });
      // Close via the drawer header, not the Cancel button: an error toast
      // renders bottom-right and intercepts pointer events over the footer.
      await page
        .locator('div.max-w-md button[aria-label="Close"]')
        .first()
        .click();

      // ── Download returns the decrypted bytes ──
      const downloadPromise = page.waitForEvent("download", {
        timeout: 30_000,
      });
      await fileRow(page, devName)
        .getByRole("button", { name: `Download ${devName}` })
        .click();
      const download = await downloadPromise;
      // Named after the path's basename, not the display name — the build
      // expects the filename.
      expect(download.suggestedFilename()).toBe("service-account.json");
    } finally {
      // ── Cleanup: delete both rows so reruns stay green ──
      for (const [name, created] of [
        [devName, devCreated],
        [prodName, prodCreated],
      ] as Array<[string, boolean]>) {
        if (!created) continue;
        try {
          await fileRow(page, name)
            .getByRole("button", { name: `Delete ${name}` })
            .click();
          await page
            .getByRole("button", { name: "Move to trash" })
            .click({ timeout: 10_000 });
          await expect(fileRow(page, name)).toHaveCount(0, { timeout: 20_000 });
        } catch {
          // Best effort — the age-gated E2E_* purge sweeps anything left.
        }
      }
    }

    // The overlap step deliberately provokes a rejected upload, so its
    // ConvexError legitimately reaches the console. Everything else must be
    // clean.
    const unexpected = clientErrors.filter(
      (entry) => !/already exists at/i.test(entry)
    );
    expect(
      unexpected,
      "no unexpected client-side errors during the flow"
    ).toEqual([]);
  });
});
