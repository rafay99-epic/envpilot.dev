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

    const download = page.getByRole("link", { name: /download 1024 png/i });
    await expect(download).toHaveAttribute(
      "download",
      "envpilot-app-icon-1024.png"
    );
    await expect(download).toHaveAttribute(
      "href",
      "/brand/envpilot-app-icon-1024.png"
    );

    const slackIcon = page.getByRole("link", { name: /slack 512 png/i });
    await expect(slackIcon).toHaveAttribute(
      "download",
      "envpilot-slack-icon-512.png"
    );
    await expect(slackIcon).toHaveAttribute(
      "href",
      "/brand/envpilot-slack-icon-512.png"
    );
  });

  test("publishes platform-ready cover downloads", async ({ page }) => {
    const assets = [
      {
        name: "Discord discovery cover",
        href: "/brand/envpilot-discord-cover-1920x1080.png",
        download: "envpilot-discord-cover-1920x1080.png",
      },
      {
        name: "Slack marketplace artwork",
        href: "/brand/envpilot-slack-marketplace-1600x1000.png",
        download: "envpilot-slack-marketplace-1600x1000.png",
      },
      {
        name: "Social sharing cover",
        href: "/brand/envpilot-social-cover-1200x630.jpg",
        download: "envpilot-social-cover-1200x630.jpg",
      },
    ] as const;

    for (const asset of assets) {
      await expect(
        page.getByRole("img", { name: `${asset.name} for Envpilot` })
      ).toBeVisible();
      const download = page
        .locator("figure")
        .filter({ hasText: asset.name })
        .getByRole("link", { name: /download/i });
      await expect(download).toHaveAttribute("href", asset.href);
      await expect(download).toHaveAttribute("download", asset.download);
    }

    await expect(page.getByText("Production URLs")).toHaveCount(0);
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
