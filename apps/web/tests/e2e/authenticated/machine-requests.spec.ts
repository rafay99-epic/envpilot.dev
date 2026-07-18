import { expect, test, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  deleteVariableByKey,
  getOwnedOrgSlug,
  getWorkerProjectSlug,
  postMcp,
  trackClientErrors,
} from "./support";

// Authenticated e2e — machine-initiated variable requests, end to end
// through the REAL surfaces: mint an API key carrying the "requests"
// resource in the org settings UI, file a request through the real MCP
// endpoint (the exact JSON-RPC call an agent makes), approve it in the
// dashboard supplying the value, verify the variable exists and the agent
// can read it, and confirm status polling reports the verdict.
// Serial: every test consumes state created by the earlier ones.

test.skip(!hasE2ECredentials, SKIP_REASON);

/** One tools/call via the shared Streamable-HTTP helper (SSE unwrap incl.). */
async function mcpToolCall(
  page: Page,
  token: string,
  tool: string,
  args: Record<string, unknown>
): Promise<{
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text: string }>;
}> {
  const { status, json } = await postMcp(page.request, token, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });
  expect(status, JSON.stringify(json)).toBe(200);
  expect(json?.error, JSON.stringify(json?.error)).toBeUndefined();
  return (json?.result ?? {}) as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content?: Array<{ type: string; text: string }>;
  };
}

test.describe.serial("Machine variable requests (MCP)", () => {
  const keyName = `E2E Requests key ${Date.now()}`;
  const variableKey = `E2E_MREQ_${Date.now()}`;
  const secretValue = `mreq-value-${Date.now()}`;
  let plaintextKey = "";
  let projectSlug = "";
  let requestId = "";

  test("mint a requests-capable API key via org settings", async ({ page }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    const orgSlug = await getOwnedOrgSlug(page);
    projectSlug = await getWorkerProjectSlug(page);

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

    // The "requests" resource is opt-in — the one mutating capability.
    await page.getByTestId("api-key-resource-requests").click();
    await expect(
      page.getByText(/may file variable requests/i).first()
    ).toBeVisible();

    await page
      .getByTestId(`api-key-project-${projectSlug}`)
      .locator('input[type="checkbox"]')
      .check();

    await page.getByRole("button", { name: /^Create Key$/i }).click();
    await expect(
      page.locator("[data-sonner-toaster]").getByText(/created/i)
    ).toBeVisible({ timeout: 10_000 });

    const keyCode = page.locator("code", { hasText: /^envpk_[0-9a-f]+$/ });
    await expect(keyCode).toBeVisible({ timeout: 20_000 });
    plaintextKey = (await keyCode.textContent())?.trim() ?? "";
    expect(plaintextKey).toMatch(/^envpk_[0-9a-f]{40}$/);
    await page.getByRole("button", { name: /^Done$/i }).click();

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("the agent files a request through the MCP endpoint", async ({
    page,
  }) => {
    test.skip(!plaintextKey, "no key from the create test");

    const result = await mcpToolCall(
      page,
      plaintextKey,
      "envpilot_request_variable",
      {
        project: projectSlug,
        key: variableKey,
        environments: ["production"],
        justification:
          "E2E: integration code is wired up — please add this key so the flow can be tested.",
      }
    );
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    const structured = result.structuredContent as {
      requestId: string;
      status: string;
      message: string;
    };
    expect(structured.status).toBe("pending");
    expect(structured.requestId).toBeTruthy();
    expect(structured.message).toMatch(/human reviewer/i);
    requestId = structured.requestId;
  });

  test("an identical duplicate request is refused", async ({ page }) => {
    test.skip(!requestId, "no request from the file test");

    const result = await mcpToolCall(
      page,
      plaintextKey,
      "envpilot_request_variable",
      {
        project: projectSlug,
        key: variableKey,
        environments: ["production"],
        justification: "E2E duplicate — must be rejected by the dedupe guard.",
      }
    );
    expect(result.isError, "duplicate must be refused").toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/pending request/i);
  });

  test("a human approves it in the dashboard, supplying the value", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!requestId, "no request from the file test");

    await page.goto("/dashboard/requests", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("requests-page")).toBeVisible({
      timeout: 20_000,
    });

    const row = page
      .getByTestId("request-row")
      .filter({ hasText: variableKey });
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Machine provenance is unmissable: automated badge + the key's name.
    await expect(row.getByText(/automated/i)).toBeVisible();
    await expect(row.getByText(new RegExp(keyName))).toBeVisible();

    // Valueless request — the approver types the value.
    await row.getByTestId("request-value-input").fill(secretValue);
    await row.getByTestId("request-accept").click();

    await expect(page.getByText(/approved and variable created/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("the agent sees the verdict and can read the variable", async ({
    page,
  }) => {
    test.skip(!requestId, "no request from the file test");

    const status = await mcpToolCall(
      page,
      plaintextKey,
      "envpilot_get_request_status",
      { request_id: requestId }
    );
    const requests = (
      status.structuredContent as {
        requests: Array<{ requestId: string; status: string }>;
      }
    ).requests;
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("approved");

    const read = await mcpToolCall(
      page,
      plaintextKey,
      "envpilot_get_variable",
      {
        project: projectSlug,
        environment: "production",
        key: variableKey,
      }
    );
    const variable = (
      read.structuredContent as {
        variable: { key: string; value?: string } | null;
      }
    ).variable;
    expect(variable, "approved variable must be readable").not.toBeNull();
    expect(variable!.value).toBe(secretValue);
  });

  test("cleanup: delete the variable and revoke the key", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!plaintextKey, "nothing to clean up");

    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await deleteVariableByKey(page, variableKey);

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
    await row.getByRole("button", { name: /^Revoke$/i }).click();
    await expect(row.getByText(/Revoked/i)).toBeVisible({ timeout: 15_000 });
  });
});
