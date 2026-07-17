import { expect, test } from "@playwright/test";
// Load root .env.local so expected hosts match what the dev server sees.
import "./env";

// Unauthenticated e2e — the marketing landing page. Covers the conversion
// surface shipped with the landing refresh: problem-first hero, published-proof
// bar, founder strip, FAQ (visible section + FAQPage structured data), and the
// final CTA linking docs on its subdomain. A regression here silently breaks
// the top of the signup funnel.

const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.envpilot.dev";
// Hardcoded in SITE_URLS (no env override) — the repo the open-source
// showcase points at.
const GITHUB_URL = "https://github.com/rafay99-epic/envpilot.dev";

test.describe("landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hero leads with the problem statement", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: /stop pasting \.env files/i })
    ).toBeVisible();
    // Exact + case-sensitive: the pricing card CTA is "Get Started Free".
    await expect(
      page.getByRole("link", { name: "Get started free", exact: true })
    ).toBeVisible();
  });

  test("proof bar links to the published artifacts", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /@envpilot\/cli/i })
    ).toHaveAttribute("href", "https://www.npmjs.com/package/@envpilot/cli");
    await expect(
      page.getByRole("link", { name: /marketplace/i })
    ).toHaveAttribute(
      "href",
      "https://marketplace.visualstudio.com/items?itemName=envpilot.envpilot"
    );
    await expect(
      page.getByRole("link", { name: /envpilot-action@v1/i })
    ).toHaveAttribute(
      "href",
      "https://github.com/rafay99-epic/envpilot-action"
    );
    await expect(
      page.getByRole("link", { name: /open source/i })
    ).toHaveAttribute("href", GITHUB_URL);
  });

  test("trust section has founder card and feedback invite", async ({
    page,
  }) => {
    const section = page.locator("section", {
      hasText: "I built Envpilot after watching",
    });
    await expect(
      section.getByRole("link", { name: /changelog/i })
    ).toHaveAttribute("href", "/changelog");
    await expect(
      section.getByRole("link", { name: /public roadmap/i })
    ).toHaveAttribute("href", "/wishlist");
    await expect(
      section.getByRole("link", { name: /star on github/i })
    ).toHaveAttribute("href", GITHUB_URL);
    await expect(
      section.getByRole("link", { name: /ceo@envpilot\.dev/i })
    ).toHaveAttribute("href", /^mailto:ceo@envpilot\.dev/);
  });

  test("FAQ answers expand and structured data is served", async ({ page }) => {
    const question = page.getByText("Where do my secrets actually live?");
    await question.scrollIntoViewIfNeeded();
    await question.click();
    await expect(page.getByText(/WorkOS Vault, AES-256-GCM/)).toBeVisible();

    const schemas = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const types = schemas.map((s) => JSON.parse(s)["@type"]);
    expect(types).toContain("SoftwareApplication");
    expect(types).toContain("FAQPage");
    // Visible copy and structured data are generated from the same source —
    // assert one shared question made it into the schema.
    const faq = schemas
      .map((s) => JSON.parse(s))
      .find((s) => s["@type"] === "FAQPage");
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toContain(
      "Where do my secrets actually live?"
    );
    // The open-source showcase adds a dedicated FAQ entry — assert it reached
    // the structured data too.
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toContain(
      "Is Envpilot open source?"
    );
  });

  test("final CTA links docs on the subdomain", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /read the docs/i })
    ).toHaveAttribute("href", DOCS_URL);
  });
});
