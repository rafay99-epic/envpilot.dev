import fs from "node:fs";
import { expect, test, type Route } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getWorkerProjectSlug, trackClientErrors } from "./support";

test.skip(!hasE2ECredentials, SKIP_REASON);

const hasB2Config = Boolean(
  process.env.B2_BUCKET &&
  process.env.B2_REGION &&
  process.env.B2_ENDPOINT_URL &&
  process.env.B2_KEY_ID &&
  process.env.B2_APPLICATION_KEY
);

test.describe("secure build artifacts", () => {
  test("shows the gated surface and round-trips an encrypted file when B2 is configured", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);
    const slug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${slug}/artifacts`, {
      waitUntil: "domcontentloaded",
    });

    const panel = page.getByTestId("secure-artifacts");
    const upgradePrompt = page.getByRole("heading", { name: "Upgrade to Pro" });
    await panel
      .or(upgradePrompt)
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => undefined);
    test.skip(
      !(await panel.isVisible().catch(() => false)) &&
        !(await upgradePrompt.isVisible().catch(() => false)),
      "artifact capabilities are not seeded on the connected Convex deployment"
    );
    await expect(panel.or(upgradePrompt)).toBeVisible({ timeout: 30_000 });

    // The authenticated fixture is Pro, but keep this test safe for a
    // deployment whose feature registry has not been seeded yet.
    test.skip(
      !(await panel.isVisible().catch(() => false)),
      "secure_artifacts is not enabled for the E2E organization"
    );
    test.skip(
      !hasB2Config,
      "B2 is not configured in the test environment; structural gate check passed"
    );

    const artifactName = `E2E artifact ${Date.now()}`;
    const fileName = "firebase-service-account.json";
    const sourcePath = test.info().outputPath(fileName);
    const plaintext = JSON.stringify({
      project_id: "e2e-secure-artifact",
      private_key: "not-a-real-key",
    });
    const replacementPath = test.info().outputPath(`replacement-${fileName}`);
    const replacementPlaintext = JSON.stringify({
      project_id: "e2e-secure-artifact-v2",
      private_key: "still-not-a-real-key",
    });
    fs.writeFileSync(sourcePath, plaintext, "utf8");
    fs.writeFileSync(replacementPath, replacementPlaintext, "utf8");

    let uploaded = false;
    let cleaned = false;
    page.on("dialog", (dialog) => dialog.accept());
    try {
      await panel.getByRole("button", { name: "Add Artifact" }).click();
      await panel.getByLabel("Name", { exact: true }).fill(artifactName);
      await panel.getByTestId("secure-artifact-file").setInputFiles(sourcePath);

      // A failed direct PUT must purge its B2 object (if any), Vault key, and
      // pending metadata. Reusing the same name proves cancellation completed
      // before the UI reports the failure.
      const b2Host = new URL(process.env.B2_ENDPOINT_URL as string).hostname;
      const failFirstB2Put = async (route: Route) => {
        const request = route.request();
        if (
          request.method() === "PUT" &&
          new URL(request.url()).hostname.endsWith(b2Host)
        ) {
          await route.fulfill({ status: 503, body: "forced E2E failure" });
          return;
        }
        await route.continue();
      };
      await page.route("**/*", failFirstB2Put);
      await panel.getByRole("button", { name: "Encrypt and upload" }).click();
      await expect(
        page.getByText("Backblaze B2 rejected the upload (503).")
      ).toBeVisible();
      await page.unroute("**/*", failFirstB2Put);

      await panel.getByRole("button", { name: "Encrypt and upload" }).click();

      const row = panel
        .getByTestId("secure-artifact-row")
        .filter({ hasText: artifactName });
      await expect(row).toBeVisible({ timeout: 45_000 });
      uploaded = true;

      const downloadPromise = page.waitForEvent("download", {
        timeout: 30_000,
      });
      const manifestPromise = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          /\/api\/artifacts\/[^/]+$/.test(new URL(response.url()).pathname)
      );
      await row.getByRole("button", { name: "Download" }).click();
      const manifest = await manifestPromise;
      expect(manifest.headers()["cache-control"]).toContain("no-store");
      const download = await downloadPromise;
      const downloadedPath = await download.path();
      expect(downloadedPath).not.toBeNull();
      expect(fs.readFileSync(downloadedPath as string, "utf8")).toBe(plaintext);

      await row
        .getByRole("button", { name: `Replace ${artifactName}` })
        .click();
      await panel
        .getByTestId("secure-artifact-file")
        .setInputFiles(replacementPath);
      await panel.getByRole("button", { name: "Encrypt and replace" }).click();
      await expect(row.getByText("v2")).toBeVisible({ timeout: 45_000 });

      const replacementDownloadPromise = page.waitForEvent("download", {
        timeout: 30_000,
      });
      await row.getByRole("button", { name: "Download" }).click();
      const replacementDownload = await replacementDownloadPromise;
      const replacementDownloadedPath = await replacementDownload.path();
      expect(replacementDownloadedPath).not.toBeNull();
      expect(fs.readFileSync(replacementDownloadedPath as string, "utf8")).toBe(
        replacementPlaintext
      );

      await row.getByRole("button", { name: `Delete ${artifactName}` }).click();
      await expect(row).toBeHidden({ timeout: 30_000 });
      cleaned = true;
    } finally {
      // The UI delete is attempted above; if an assertion interrupted it,
      // leave a clear test note instead of issuing an unscoped API mutation.
      if (uploaded && !cleaned) {
        test.info().annotations.push({
          type: "note",
          description: `If cleanup was interrupted, delete secure artifact "${artifactName}" manually from the fixture project.`,
        });
      }
      fs.rmSync(sourcePath, { force: true });
      fs.rmSync(replacementPath, { force: true });
    }

    expect(
      clientErrors,
      `unexpected client-side errors in the secure artifact flow: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
