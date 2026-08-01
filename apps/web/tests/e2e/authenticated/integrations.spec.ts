import { expect, test, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getOwnedOrgSlug, trackClientErrors } from "./support";

test.skip(!hasE2ECredentials, SKIP_REASON);

const webhookUrl = process.env.E2E_NOTIFICATION_WEBHOOK_URL;
const webhookType =
  webhookUrl?.includes("discord.com/api/webhooks/") ||
  webhookUrl?.includes("discordapp.com/api/webhooks/")
    ? "discord"
    : "slack";

async function openIntegrationsTab(page: Page, orgSlug: string) {
  await page.goto(`/organizations/${orgSlug}/settings`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("button", { name: /^General$/i }).first()
  ).toBeVisible({ timeout: 20_000 });

  const tab = page.getByRole("button", { name: /^Integrations$/i }).first();
  const tabVisible = await tab
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !tabVisible,
    "Integrations tab not visible — this run is not an organization owner"
  );
  await tab.click();

  const addButton = page.getByTestId("add-webhook-manually");
  const gateOpen = await addButton
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!gateOpen, "team_notifications is gated off for this org/tier");
}

async function webhookIds(page: Page): Promise<string[]> {
  return await page.getByTestId("webhook-row").evaluateAll((rows) =>
    rows.flatMap((row) => {
      const id = (row as HTMLElement).dataset.webhookId;
      return id ? [id] : [];
    })
  );
}

function webhookRow(page: Page, webhookId: string) {
  return page.locator(
    `[data-testid="webhook-row"][data-webhook-id="${webhookId}"]`
  );
}

// DOM traces can snapshot a capability URL while the manual form is filled.
test.use({ trace: "off" });

test.describe("Notification webhooks", () => {
  test("rejects a cross-provider webhook URL", async ({ page }) => {
    test.setTimeout(120_000);
    await openIntegrationsTab(page, await getOwnedOrgSlug(page));

    await page.getByTestId("add-webhook-manually").click();
    await page
      .getByPlaceholder("https://hooks.slack.com/services/...")
      .fill("https://discord.com/api/webhooks/123/abc");
    await page.getByRole("button", { name: /^Add destination$/i }).click();

    await expect(
      page.getByText(/Enter a Slack Incoming Webhook URL/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("runs the real webhook lifecycle", async ({ page }) => {
    test.skip(
      !webhookUrl,
      "Set E2E_NOTIFICATION_WEBHOOK_URL to a disposable real Slack or Discord webhook"
    );
    const configuredWebhookUrl = webhookUrl!;
    test.setTimeout(180_000);
    const clientErrors = trackClientErrors(page);
    const webhookName = `${webhookType === "discord" ? "Discord" : "Slack"} notifications`;
    await openIntegrationsTab(page, await getOwnedOrgSlug(page));
    const existingWebhookIds = new Set(await webhookIds(page));
    let createdWebhookId: string | null = null;

    try {
      await page.getByTestId("add-webhook-manually").click();
      const form = page.getByTestId("manual-webhook-form");
      await form.getByLabel("Provider").selectOption(webhookType);
      await form
        .getByPlaceholder(
          webhookType === "discord"
            ? "https://discord.com/api/webhooks/..."
            : "https://hooks.slack.com/services/..."
        )
        .fill(configuredWebhookUrl);

      await form.getByRole("button", { name: /^Add destination$/i }).click();
      await expect(
        page.getByText(/Destination added.*test message/i)
      ).toBeVisible({
        timeout: 20_000,
      });

      await expect
        .poll(
          async () =>
            (await webhookIds(page)).filter(
              (webhookId) => !existingWebhookIds.has(webhookId)
            ),
          {
            timeout: 20_000,
            message: "exactly one new webhook should be created",
          }
        )
        .toHaveLength(1);
      [createdWebhookId] = (await webhookIds(page)).filter(
        (webhookId) => !existingWebhookIds.has(webhookId)
      );
      const row = webhookRow(page, createdWebhookId!);
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row).toContainText("variables, requests");
      await expect(row).toContainText("sent", { timeout: 45_000 });
      expect(
        (await page.content()).includes(configuredWebhookUrl),
        "the webhook capability URL must not be rendered after submission"
      ).toBe(false);

      await row.getByRole("button", { name: /^Manage$/i }).click();
      await expect(
        row.getByRole("checkbox", { name: /Variables/i })
      ).toBeChecked();
      await expect(
        row.getByRole("checkbox", { name: /Requests/i })
      ).toBeChecked();
      await expect(
        row.getByRole("checkbox", { name: /Members/i })
      ).not.toBeChecked();
      await expect(
        row.getByRole("checkbox", { name: /Security/i })
      ).not.toBeChecked();
      await row.getByRole("checkbox", { name: /Members/i }).check();
      const projectsFieldset = row
        .locator("fieldset")
        .filter({ hasText: /^Projects/ });
      await projectsFieldset.getByRole("combobox").selectOption("selected");
      const projectCheckbox = projectsFieldset.getByRole("checkbox").first();
      await expect(projectCheckbox).toBeVisible();
      const projectName = await projectCheckbox.locator("xpath=..").innerText();
      await projectCheckbox.check();
      await row.getByRole("button", { name: /^Save routing$/i }).click();
      await expect(row).toContainText("variables, requests, members");
      await expect(row).toContainText(projectName.trim());

      await row.getByRole("button", { name: /^Pause$/i }).click();
      await expect(page.getByText(/Destination paused/i)).toBeVisible();
      await row.getByRole("button", { name: /^Resume$/i }).click();
      await expect(page.getByText(/Destination resumed/i)).toBeVisible();

      const previousDelivery = await row.getAttribute("data-last-sent-at");
      expect(previousDelivery).toBeTruthy();
      await row.getByTitle("Send test message").click();
      await expect(page.getByText(/Test message queued/i)).toBeVisible();
      await expect
        .poll(() => row.getAttribute("data-last-sent-at"), {
          timeout: 45_000,
          message: "test delivery should complete successfully",
        })
        .not.toBe(previousDelivery);

      await row.getByTitle("Disconnect destination").click();
      const dialog = row.getByRole("dialog", {
        name: `Disconnect ${webhookName}`,
      });
      await dialog.getByRole("button", { name: /^Disconnect$/i }).click();
      await expect(row).toHaveCount(0, { timeout: 20_000 });

      expect(
        clientErrors,
        `unexpected client-side errors: ${clientErrors.join("\n")}`
      ).toHaveLength(0);
    } finally {
      const cleanupIds = createdWebhookId
        ? [createdWebhookId]
        : (await webhookIds(page)).filter(
            (webhookId) => !existingWebhookIds.has(webhookId)
          );
      for (const webhookId of cleanupIds) {
        const row = webhookRow(page, webhookId);
        if ((await row.count()) === 0) continue;
        await row.getByTitle("Disconnect destination").click();
        await row
          .getByRole("dialog", { name: `Disconnect ${webhookName}` })
          .getByRole("button", { name: /^Disconnect$/i })
          .click();
        await expect(row).toHaveCount(0, { timeout: 20_000 });
      }
    }
  });
});
