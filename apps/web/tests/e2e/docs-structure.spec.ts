import { expect, test, type APIRequestContext } from "@playwright/test";
// Load root .env.local so the docs host matches what the dev servers see.
import "./env";

// Unauthenticated e2e — the docs app's information architecture after the
// section split. Two things must hold or inbound traffic breaks silently:
//
//   1. Every pre-split slug still resolves (301) to the page that now owns
//      its content. Those URLs are indexed and linked from the CLI, the
//      extension, blog posts, and the marketing site.
//   2. The nested pages themselves render, and the machine-readable
//      surfaces (search index, sitemap) use the nested slugs.
//
// The docs app runs on :3002, which the web suite does not start. Every test
// here self-skips when it is not reachable, so a plain `bunx playwright test`
// stays green — run `bun run dev` (or `bun run dev:docs`) to exercise it.

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3002";

/** [pre-split slug, page that owns it now] */
const LEGACY_REDIRECTS: [string, string][] = [
  ["/getting-started", "/start/quickstart"],
  ["/cli", "/cli/overview"],
  ["/extension", "/extension/overview"],
  ["/api-reference", "/api/overview"],
  ["/api-security", "/api/authentication"],
  ["/mcp-server", "/mcp/overview"],
  ["/github-action", "/action/overview"],
  ["/web-dashboard", "/dashboard/overview"],
  ["/rbac", "/platform/rbac"],
  ["/variable-lifecycle", "/platform/variables"],
  ["/plans", "/limits/plans"],
  ["/rate-limits", "/limits/rate-limits"],
  ["/nextjs-environment-variables", "/guides/nextjs"],
];

/** One page per section — proves the catch-all route resolves each folder. */
const SECTION_PAGES = [
  "/start/quickstart",
  "/platform/secret-files",
  "/limits/plans",
  "/cli/files",
  "/extension/protection",
  "/action/secret-files",
  "/api/files",
  "/mcp/tools",
  "/dashboard/project",
  "/integrations/notifications",
  "/guides/android-keystore-ci",
];

async function docsReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(DOCS_URL, { timeout: 5_000 });
    return response.ok();
  } catch {
    return false;
  }
}

test.describe("docs information architecture", () => {
  test("every legacy slug redirects to its new owner", async ({ request }) => {
    test.skip(
      !(await docsReachable(request)),
      `docs app not reachable at ${DOCS_URL}`
    );

    for (const [legacy, destination] of LEGACY_REDIRECTS) {
      const response = await request.get(`${DOCS_URL}${legacy}`, {
        maxRedirects: 0,
      });
      expect([301, 308], `${legacy} should redirect permanently`).toContain(
        response.status()
      );
      // Next emits a path for same-host redirects; accept an absolute URL too.
      const location = response.headers()["location"] ?? "";
      expect(
        location.replace(/^https?:\/\/[^/]+/, ""),
        `${legacy} destination`
      ).toBe(destination);
    }
  });

  test("each section serves its pages", async ({ page, request }) => {
    test.skip(
      !(await docsReachable(request)),
      `docs app not reachable at ${DOCS_URL}`
    );

    for (const path of SECTION_PAGES) {
      const response = await page.goto(`${DOCS_URL}${path}`);
      expect(response?.status(), `${path} should render`).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
      // Every page states its boundaries — the docs contract, not decoration.
      await expect(
        page
          .getByRole("heading", { name: /limits|what this does not/i })
          .first()
      ).toBeVisible();
    }
  });

  test("search index and sitemap use nested slugs", async ({ request }) => {
    test.skip(
      !(await docsReachable(request)),
      `docs app not reachable at ${DOCS_URL}`
    );

    const index = await (
      await request.get(`${DOCS_URL}/search-index.json`)
    ).json();
    expect(Array.isArray(index)).toBe(true);
    expect(index.length).toBeGreaterThan(30);
    for (const entry of index) {
      expect(entry.slug, `${entry.slug} should be <section>/<page>`).toMatch(
        /^[a-z0-9-]+\/[a-z0-9-]+$/
      );
      expect(entry.title).toBeTruthy();
      expect(entry.section).toBeTruthy();
    }

    const sitemap = await (await request.get(`${DOCS_URL}/sitemap.xml`)).text();
    expect(sitemap).toContain("/start/quickstart");
    expect(sitemap).not.toContain("/getting-started<");
  });

  test("search finds a page by title", async ({ page, request }) => {
    test.skip(
      !(await docsReachable(request)),
      `docs app not reachable at ${DOCS_URL}`
    );

    await page.goto(`${DOCS_URL}/start/quickstart`);
    await page
      .getByRole("button", { name: /search docs/i })
      .first()
      .click();

    const input = page.getByRole("textbox", { name: /search the docs/i });
    await expect(input).toBeFocused();
    await input.fill("secret files");

    const result = page.getByRole("link", { name: /secret files/i }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(
      /\/(platform|cli|api|action)\/(secret-)?files/
    );
  });
});
