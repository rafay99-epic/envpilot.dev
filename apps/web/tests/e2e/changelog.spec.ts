import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Unauthenticated e2e — /changelog is now a static page built from
// content/CHANGELOG.md. It reads no database, so the risks are: a malformed
// entry gets dropped silently by the loader, the file/page drift apart, or
// the shared docs renderer stops being applied. Each is asserted below
// against the source file rather than a hardcoded count, so adding a
// release never breaks this spec.

/** Frontmatter of every entry in the single content file. */
function sourceEntries() {
  const file = resolve(process.cwd(), "content/CHANGELOG.md");
  return readFileSync(file, "utf-8")
    .split(/^<!-- entry -->$/m)
    .slice(1)
    .map((block) => {
      const fm = block.trimStart().split(/^---$/m)[1] ?? "";
      const read = (key: string) =>
        fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim() ?? "";
      return {
        version: read("version"),
        title: read("title").replace(/^"|"$/g, ""),
      };
    });
}

test.describe("/changelog", () => {
  test("renders every entry from the content file", async ({ page }) => {
    const entries = sourceEntries();
    expect(entries.length).toBeGreaterThan(0);

    await page.goto("/changelog");

    // The count line is the page's own claim about how much it loaded.
    await expect(
      page.getByText(`${entries.length} entries`, { exact: true })
    ).toBeVisible();

    // Newest entry is above the fold; the oldest only after paging through.
    const newest = entries[0];
    await expect(
      page.getByRole("heading", { name: newest.title, level: 2 })
    ).toBeVisible();

    const loadMore = page.getByRole("button", { name: "Load more" });
    while (await loadMore.isVisible()) {
      await loadMore.click();
    }

    const oldest = entries[entries.length - 1];
    await expect(
      page.getByRole("heading", { name: oldest.title, level: 2 })
    ).toBeVisible();
  });

  test("bodies render through the shared docs components", async ({ page }) => {
    await page.goto("/changelog");

    // docsComponents gives headings a scroll anchor and lists the accent
    // bullet pseudo-element. Plain markdown output has neither, so these
    // fail if entry bodies stop going through the shared docs pipeline.
    const article = page.locator("article").first();
    await expect(article.locator("h3.scroll-mt-24").first()).toBeVisible();

    const listClasses = await article
      .locator("ul")
      .first()
      .getAttribute("class");
    expect(listClasses).toContain("before:rounded-full");
  });

  test("filters by type without dropping the page", async ({ page }) => {
    await page.goto("/changelog");

    const total = sourceEntries().length;
    await page.getByRole("button", { name: /feature/ }).click();

    // Filtering narrows, never empties: the seeded history has features.
    await expect(
      page.getByText(new RegExp(`of ${total} entries match`))
    ).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("is served statically — no Convex websocket needed", async ({
    page,
  }) => {
    // The page must render with the client bundle unable to reach Convex.
    await page.route("**/*.convex.cloud/**", (route) => route.abort());
    await page.goto("/changelog");
    await expect(page.locator("article").first()).toBeVisible();
  });
});
