import { expect, test } from "@playwright/test";

test.describe("brand assets page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/logo");
  });

  test("is public and exposes the original application icon", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Envpilot brand assets" })
    ).toBeVisible();

    await expect(
      page.getByRole("img", {
        name: "Envpilot shield and terminal application icon",
      })
    ).toBeVisible();

    const download = page.getByRole("link", { name: /download original png/i });
    await expect(download).toHaveAttribute(
      "download",
      "envpilot-logo-1024.png"
    );
    await expect(download).toHaveAttribute("href", /logo\.[a-z0-9_-]+\.png$/i);
  });

  test("publishes provider callback and legal URLs", async ({ page }) => {
    await expect(
      page.getByRole("link", {
        name: "https://www.envpilot.dev/api/integrations/slack/callback",
      })
    ).toHaveAttribute(
      "href",
      "https://www.envpilot.dev/api/integrations/slack/callback"
    );
    await expect(
      page.getByRole("link", {
        name: "https://www.envpilot.dev/api/integrations/discord/callback",
      })
    ).toHaveAttribute(
      "href",
      "https://www.envpilot.dev/api/integrations/discord/callback"
    );
    await expect(
      page.getByRole("link", { name: "https://www.envpilot.dev/terms" })
    ).toHaveAttribute("href", "https://www.envpilot.dev/terms");
    await expect(
      page.getByRole("link", { name: "https://www.envpilot.dev/privacy" })
    ).toHaveAttribute("href", "https://www.envpilot.dev/privacy");
  });

  test("publishes copy-ready provider descriptions and Discord tags", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { level: 2, name: "App profile descriptions" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Secure environment-variable and access-request notifications for your team."
      )
    ).toBeVisible();

    const tags = page.getByRole("list", { name: "Discord tags" });
    for (const tag of [
      "Developer Tools",
      "DevOps",
      "Security",
      "Notifications",
      "Productivity",
    ]) {
      await expect(
        tags.getByRole("listitem").filter({ hasText: tag })
      ).toBeVisible();
    }
  });
});

test.describe("integration legal disclosures", () => {
  test("terms explain Slack and Discord notifications", async ({ page }) => {
    await page.goto("/terms");

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Third-Party Integrations",
      })
    ).toBeVisible();
    await expect(
      page.getByText("does not include environment variable or secret values")
    ).toBeVisible();
  });

  test("privacy policy explains provider access and deletion", async ({
    page,
  }) => {
    await page.goto("/privacy");

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Slack and Discord Integrations",
      })
    ).toBeVisible();
    await expect(
      page.getByText("permission required to create an incoming webhook")
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 3,
        name: "8.4 Disconnecting an Integration",
      })
    ).toBeVisible();
  });
});
