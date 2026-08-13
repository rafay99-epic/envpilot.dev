import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getOwnedOrgSlug, trackClientErrors } from "./support";

// Authenticated e2e — MCP scope guidance in the API key create form: when
// the MCP server surface is selected, the form shows which MCP tools each
// resource unlocks, and warns when the projects resource is missing (an
// MCP key without it fails on every client's opening list_projects call).
// UI-only: no key is created, so nothing to clean up.

test.skip(!hasE2ECredentials, SKIP_REASON);

test("MCP requirements panel reacts to surface + resource selection", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const clientErrors = trackClientErrors(page);

  const orgSlug = await getOwnedOrgSlug(page);
  await page.goto(`/organizations/${orgSlug}/settings`, {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("button", { name: /^General$/i }).first()
  ).toBeVisible({ timeout: 20_000 });

  const apiKeysTab = page.getByRole("button", { name: /^API Keys$/i }).first();
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
  // The drawer mounts with the keys query, so wait for the form itself
  // before reaching into it — clicking mid-mount silently no-ops.
  await expect(page.locator("#api-key-name")).toBeVisible({
    timeout: 20_000,
  });
  // Surfaces, resources and expiry live under the Advanced disclosure
  // now that the drawer opens on a purpose preset.
  await page.getByTestId("api-key-advanced").click();
  await expect(page.locator("#api-key-name")).toBeVisible({ timeout: 10_000 });

  // MCP server is a default surface, so the requirements panel starts
  // visible, listing every resource with the MCP tools it unlocks.
  const panel = page.getByTestId("api-key-mcp-requirements");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("api-key-mcp-tools-projects")).toContainText(
    "envpilot_list_projects"
  );
  await expect(panel.getByTestId("api-key-mcp-tools-variables")).toContainText(
    "envpilot_get_variables"
  );
  await expect(panel.getByTestId("api-key-mcp-tools-accounts")).toContainText(
    "envpilot_list_accounts"
  );
  await expect(panel.getByTestId("api-key-mcp-tools-requests")).toContainText(
    "envpilot_request_variable"
  );
  await expect(panel.getByTestId("api-key-mcp-tools-docs")).toContainText(
    "envpilot_search_docs"
  );

  // docs and files are mutually exclusive: documentation is untrusted text an
  // agent reads into context, and file access returns decrypted key material.
  // Selecting one clears the other, so the form can never submit a pair the
  // backend refuses (convex/features/api/keys.ts::assertResourceCombination).
  const docsChip = page.getByTestId("api-key-resource-docs");
  const filesChip = page.getByTestId("api-key-resource-files");
  await filesChip.click();
  await expect(filesChip).toHaveAttribute("aria-pressed", "true");
  await docsChip.click();
  await expect(docsChip).toHaveAttribute("aria-pressed", "true");
  await expect(filesChip).toHaveAttribute("aria-pressed", "false");
  // Clear docs again so the rest of the assertions run on the default scope.
  await docsChip.click();
  await expect(docsChip).toHaveAttribute("aria-pressed", "false");

  // projects is on by default, so no warning yet.
  const warning = page.getByTestId("api-key-mcp-projects-warning");
  await expect(warning).toBeHidden();

  // Deselect projects — the missing-scope warning appears.
  await page.getByTestId("api-key-resource-projects").click();
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(/projects resource/i);

  // Re-select projects — the warning clears.
  await page.getByTestId("api-key-resource-projects").click();
  await expect(warning).toBeHidden();

  // Deselect the MCP surface entirely — the panel disappears.
  await page.getByTestId("api-key-surface-mcp_server").click();
  await expect(panel).toBeHidden();

  expect(
    clientErrors,
    `unexpected client-side errors: ${clientErrors.join("\n")}`
  ).toEqual([]);
});
