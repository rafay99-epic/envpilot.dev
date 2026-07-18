import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getOwnedOrgSlug,
  getWorkerProjectSlug,
  trackClientErrors,
} from "./support";

// Authenticated e2e — the GitHub Action credential, post-unification: an
// Action credential is now an API key minted in org settings with the
// github_action surface (locked to one project + variables). The legacy
// project-settings CI/CD tab no longer creates tokens — it points at the
// unified API Keys section. This spec drives the real create flow, pulls
// through the real machine endpoint (the exact call the GitHub Action
// makes), verifies scoping, and revokes. The legacy project-settings CI/CD
// tab is gone entirely — serviceTokens are retired.
// Serial: the pull/reject/revoke tests consume state the first test creates.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe.serial("GitHub Action keys (CI/CD)", () => {
  const keyName = `E2E Action key ${Date.now()}`;
  const variableKey = `E2E_CICD_${Date.now()}`;
  let plaintextToken = "";
  let projectSlug = "";

  test("create a GitHub Action key via org settings API Keys", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    const orgSlug = await getOwnedOrgSlug(page);
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

    await page.goto(`/organizations/${orgSlug}/settings?tab=apiKeys`, {
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
    await page.locator("#api-key-name").fill(keyName);

    // Selecting the GitHub Action surface locks the form to a single
    // project + variables — the only key shape the Action pull accepts.
    await page.getByTestId("api-key-surface-github_action").click();
    await expect(
      page.getByText(/locked to exactly one project/i)
    ).toBeVisible();

    await page
      .getByTestId(`api-key-project-${projectSlug}`)
      .locator('input[type="checkbox"]')
      .check();

    await page.getByRole("button", { name: /^Create Key$/i }).click();
    await expect(
      page.locator("[data-sonner-toaster]").getByText(/created/i)
    ).toBeVisible({ timeout: 10_000 });

    const tokenCode = page.locator("code", { hasText: /^envpk_[0-9a-f]+$/ });
    await expect(tokenCode, "plaintext key should be revealed").toBeVisible({
      timeout: 20_000,
    });
    plaintextToken = (await tokenCode.textContent())?.trim() ?? "";
    expect(plaintextToken).toMatch(/^envpk_[0-9a-f]{40}$/);

    await page.getByRole("button", { name: /^Done$/i }).click();

    // The row carries the GitHub Action surface badge.
    const row = page
      .getByTestId("api-keys-list")
      .locator("li")
      .filter({ hasText: keyName });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(
      row.getByText(/1 project · production · variables · GitHub Action/)
    ).toBeVisible();

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("the machine endpoint serves scoped secrets for the key", async ({
    page,
  }) => {
    test.skip(!plaintextToken, "no key from the create test");

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
    test.skip(!plaintextToken, "no key from the create test");

    const wrongEnv = await page.request.get(
      "/api/v1/secrets?environment=development",
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(wrongEnv.status(), "key is production-only").toBe(403);

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

  test("revoking the key kills it immediately", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!plaintextToken, "no key from the create test");

    const orgSlug = await getOwnedOrgSlug(page);
    await page.goto(`/organizations/${orgSlug}/settings?tab=apiKeys`, {
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
    await expect(
      row.getByText(/Revoke this key\? Anything using it will stop working/i)
    ).toBeVisible({ timeout: 10_000 });
    await row.getByRole("button", { name: /^Revoke$/i }).click();
    await expect(row.getByText(/Revoked/i)).toBeVisible({ timeout: 15_000 });

    const afterRevoke = await page.request.get(
      "/api/v1/secrets?environment=production",
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(afterRevoke.status(), "revoked key must 401").toBe(401);

    // Cleanup the test variable.
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await deleteVariableByKey(page, variableKey);
  });
});
