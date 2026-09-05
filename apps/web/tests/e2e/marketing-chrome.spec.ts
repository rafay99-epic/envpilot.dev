import { expect, test } from "@playwright/test";
// Load root .env.local so the config sees the same hosts the dev server does.
import "./env";

// The sub-pages now render in the landing page's language: a mono eyebrow,
// one sans <h1>, and panel surfaces (ring + inset highlight) instead of the
// retired glow/aurora kit. A missed class emits no CSS with the palette
// deleted, so the panel assertion reads a computed style rather than a class.

const PAGES = [
  { path: "/pricing", eyebrow: "envpilot — pricing" },
  { path: "/faq", eyebrow: "envpilot — faq" },
  { path: "/wishlist", eyebrow: "envpilot — wishlist" },
  { path: "/changelog", eyebrow: "envpilot — changelog" },
  { path: "/support", eyebrow: "envpilot — support" },
  { path: "/contact", eyebrow: "envpilot — contact" },
  { path: "/logo", eyebrow: "envpilot — brand" },
  { path: "/privacy", eyebrow: "envpilot — privacy" },
  { path: "/terms", eyebrow: "envpilot — terms" },
  { path: "/vs/doppler", eyebrow: "envpilot — comparison" },
  { path: "/vs/phase", eyebrow: "envpilot — comparison" },
] as const;

test.describe("marketing sub-page chrome", () => {
  for (const { path, eyebrow } of PAGES) {
    test(`${path} wears the terminal hero`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      await expect(page.getByText(eyebrow, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // One h1 per page — the hero. Sections below it are h2.
      expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
    });
  }

  test("panels paint the surface token with a ring, not a flat border", async ({
    page,
  }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });

    const panel = page.locator(".rounded-panel.bg-surface").first();
    await expect(panel).toBeVisible();

    const style = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, shadow: s.boxShadow };
    });

    // --color-surface is #0b0d0c; a transparent fallback means the class
    // compiled to nothing.
    expect(style.background).toBe("rgb(11, 13, 12)");
    expect(style.shadow).not.toBe("none");
  });

  test("changelog pages in 10 at a time instead of loading everything", async ({
    page,
  }) => {
    await page.goto("/changelog", { waitUntil: "domcontentloaded" });

    const entries = page.locator("article");
    await expect(entries.first()).toBeVisible();
    const firstPage = await entries.count();
    expect(firstPage).toBeLessThanOrEqual(10);

    const loadMore = page.getByRole("button", { name: "Load more" });
    // Fewer than two pages published on this deployment — nothing to page.
    test.skip(
      (await loadMore.count()) === 0,
      "changelog has a single page of entries"
    );

    await loadMore.click();
    await expect
      .poll(() => entries.count(), { timeout: 15_000 })
      .toBeGreaterThan(firstPage);
  });

  test("FAQ answers open without JavaScript state", async ({ page }) => {
    await page.goto("/faq", { waitUntil: "domcontentloaded" });

    const question = page.locator("summary", { hasText: "What is Envpilot?" });
    await question.scrollIntoViewIfNeeded();
    await question.click();

    await expect(
      page.getByText(/secure environment variable management platform/i).first()
    ).toBeVisible();
  });
});
