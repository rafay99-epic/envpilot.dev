import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

// With the palette deleted in theme.css, a missed class emits no CSS and
// renders invisible instead of failing the build — typecheck and lint both
// pass. These assertions read computed styles, which is what catches it.

test.skip(!hasE2ECredentials, SKIP_REASON);

const REQUIRED_TOKENS = [
  "--color-canvas",
  "--color-surface",
  "--color-surface-raised",
  "--color-chrome",
  "--color-line",
  "--color-ink",
  "--color-ink-muted",
  "--color-ink-subtle",
  "--color-accent",
] as const;

function rgbChannels(color: string): number[] | null {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  return match[1].split(",").map((part) => Number.parseFloat(part));
}

test.describe("design tokens", () => {
  test("theme variables resolve on the dashboard", async ({ page }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });

    const resolved = await page.evaluate(
      (tokens) => {
        const styles = getComputedStyle(document.documentElement);
        return Object.fromEntries(
          tokens.map((token) => [token, styles.getPropertyValue(token).trim()])
        );
      },
      REQUIRED_TOKENS as unknown as string[]
    );

    for (const token of REQUIRED_TOKENS) {
      expect(resolved[token], `${token} must be defined`).not.toBe("");
    }

    expect(clientErrors).toEqual([]);
  });

  test("the shell paints the canvas token, not a transparent fallback", async ({
    page,
  }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });

    const bodyBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );

    const channels = rgbChannels(bodyBackground);
    expect(channels, `unexpected body background: ${bodyBackground}`).not.toBe(
      null
    );
    // Fully transparent means the class compiled to nothing.
    expect(channels![3] ?? 1).toBeGreaterThan(0);
    // Dark canvas: every channel well below mid grey.
    expect(Math.max(channels![0], channels![1], channels![2])).toBeLessThan(60);
  });

  test("body text uses Geist, not the old Arial fallback", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });

    const fontFamily = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily
    );
    expect(fontFamily.toLowerCase()).not.toContain("arial");
  });

  test("page headers render the shared PageHeader", async ({ page }) => {
    test.setTimeout(60_000);

    for (const [path, heading] of [
      ["/dashboard/projects", "Projects"],
      ["/dashboard/audit", "Audit Logs"],
    ] as const) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: heading, level: 1 })
      ).toBeVisible({ timeout: 20_000 });
    }
  });
});
