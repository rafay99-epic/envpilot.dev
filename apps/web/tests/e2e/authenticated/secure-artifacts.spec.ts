import fs from "node:fs";
import { expect, test } from "@playwright/test";

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

    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });

    const panel = page.getByTestId("secure-artifacts");
    const upgradePrompt = page.getByRole("heading", { name: "Upgrade to Pro" });
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
    fs.writeFileSync(sourcePath, plaintext, "utf8");

    let uploaded = false;
    let cleaned = false;
    page.on("dialog", (dialog) => dialog.accept());
    try {
      await panel.getByPlaceholder(/Artifact name/).fill(artifactName);
      await panel.getByTestId("secure-artifact-file").setInputFiles(sourcePath);
      await panel.getByRole("button", { name: "Upload encrypted file" }).click();

      const row = panel
        .getByTestId("secure-artifact-row")
        .filter({ hasText: artifactName });
      await expect(row).toBeVisible({ timeout: 45_000 });
      uploaded = true;

      const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
      await row.getByRole("button", { name: "Download" }).click();
      const download = await downloadPromise;
      const downloadedPath = await download.path();
      expect(downloadedPath).not.toBeNull();
      expect(fs.readFileSync(downloadedPath as string, "utf8")).toBe(plaintext);

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
    }

    expect(
      clientErrors,
      `unexpected client-side errors in the secure artifact flow: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
