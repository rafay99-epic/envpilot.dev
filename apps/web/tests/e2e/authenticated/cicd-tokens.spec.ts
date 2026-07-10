import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getWorkerProjectSlug,
  trackClientErrors,
} from "./support";

// Authenticated e2e — CI/CD service tokens end to end: create a token
// through the real settings UI, pull secrets with it through the real
// machine endpoint (the exact call the GitHub Action makes), verify
// environment scoping is enforced, then revoke and verify the token dies.
// Serial: the pull/reject/revoke tests all consume state the first test
// creates within this worker's own fixture project.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe.serial("CI/CD service tokens", () => {
  const tokenName = `E2E token ${Date.now()}`;
  const variableKey = `E2E_CICD_${Date.now()}`;
  let plaintextToken = "";
  let projectSlug = "";

  test("create a production-scoped token via project settings", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    projectSlug = await getWorkerProjectSlug(page);

    // A production-scoped variable for the pull to return.
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await createVariable(page, {
      key: variableKey,
      value: `cicd-value-${Date.now()}`,
      environments: ["production"],
    });

    await page.goto(`/dashboard/projects/${projectSlug}/settings`, {
      waitUntil: "domcontentloaded",
    });
    // Settings tabs render after the project + auth context resolve — wait
    // for a stable anchor before sampling for the role-gated CI/CD tab.
    await expect(
      page.getByRole("button", { name: /^General$/i }).first()
    ).toBeVisible({ timeout: 20_000 });

    const tokensTab = page
      .getByRole("button", { name: /CI\/CD Tokens/i })
      .first();
    const tabVisible = await tokensTab
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !tabVisible,
      "CI/CD Tokens tab not visible — cicd_service_tokens is gated off for this org/tier"
    );
    await tokensTab.click();

    await page.getByRole("button", { name: /New Token/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.locator("input[type='text']").first().fill(tokenName);
    // Production is the pre-checked recommended default — assert, don't click.
    const productionBox = dialog.getByRole("checkbox", {
      name: /production/i,
    });
    if (await productionBox.isVisible().catch(() => false)) {
      await expect(productionBox).toBeChecked();
    }

    await dialog.getByRole("button", { name: /^Create/i }).click();

    // One-time reveal: the plaintext appears exactly once.
    const tokenCode = dialog.locator("code", { hasText: /^envpk_[0-9a-f]+$/ });
    await expect(tokenCode, "plaintext token should be revealed").toBeVisible({
      timeout: 20_000,
    });
    plaintextToken = (await tokenCode.textContent())?.trim() ?? "";
    expect(plaintextToken).toMatch(/^envpk_[0-9a-f]{40}$/);

    await page.keyboard.press("Escape");

    // The list shows the token with its scope; the hash never appears.
    await expect(page.getByText(tokenName)).toBeVisible({ timeout: 10_000 });

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("the machine endpoint serves scoped secrets for the token", async ({
    page,
  }) => {
    test.skip(!plaintextToken, "no token from the create test");

    const response = await page.request.get(
      "/api/v1/secrets?environment=production",
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as {
      project: { slug: string };
      environment: string;
      variables: Array<{ key: string; value: string }>;
    };
    expect(body.environment).toBe("production");
    expect(body.project.slug).toBe(projectSlug);
    const pulled = body.variables.find((v) => v.key === variableKey);
    expect(pulled, "the production variable should be pulled").toBeTruthy();
    expect(pulled!.value).toMatch(/^cicd-value-/);
  });

  test("out-of-scope environments and bad tokens are rejected", async ({
    page,
  }) => {
    test.skip(!plaintextToken, "no token from the create test");

    const wrongEnv = await page.request.get(
      "/api/v1/secrets?environment=development",
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(wrongEnv.status(), "token is production-only").toBe(403);

    const badToken = await page.request.get(
      "/api/v1/secrets?environment=production",
      { headers: { Authorization: `Bearer envpk_${"0".repeat(40)}` } }
    );
    expect(badToken.status(), "unknown token must 401").toBe(401);

    const noToken = await page.request.get(
      "/api/v1/secrets?environment=production"
    );
    expect(noToken.status(), "missing bearer must 401").toBe(401);
  });

  test("revoking the token kills it immediately", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!plaintextToken, "no token from the create test");

    await page.goto(`/dashboard/projects/${projectSlug}/settings`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: /CI\/CD Tokens/i })
      .first()
      .click();

    const row = page
      .locator("div")
      .filter({ hasText: tokenName })
      .locator("visible=true");
    await expect(row.first()).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole("button", { name: /^Revoke$/i })
      .first()
      .click();
    // ConfirmDialog — confirm the revocation.
    const confirm = page.getByRole("button", { name: /^Revoke( Token)?$/i });
    await confirm.last().click();

    await expect(page.getByText(/Revoked/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const afterRevoke = await page.request.get(
      "/api/v1/secrets?environment=production",
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(afterRevoke.status(), "revoked token must 401").toBe(401);

    // Cleanup the test variable.
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await deleteVariableByKey(page, variableKey);
  });
});
