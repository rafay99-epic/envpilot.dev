import { expect, test, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

// Authenticated e2e — the project grid at /dashboard/projects.
//
// The page size is no longer the hardcoded 9 that left a dead band under the
// last row on tall windows; it is measured from the laid-out grid (columns x
// rows that fit the scroll viewport). This spec pins the two properties that
// measurement has to hold:
//   A. The rendered page always fits — no row is pushed below the fold, and
//      the count is a whole number of grid columns.
//   B. Height changes the page size — a taller window shows strictly more
//      projects per page, which is the point of the change.
//
// The account's project count varies between runs and other parallel workers
// create/delete their own fixture projects, so nothing here asserts an exact
// number; assertions that need a minimum amount of data self-skip instead.

test.skip(!hasE2ECredentials, SKIP_REASON);

/** Project cards in the grid — excludes the "New Project" header action. */
function projectCards(page: Page) {
  return page.locator(
    'main a[href^="/dashboard/projects/"]:not([href$="/new"])'
  );
}

async function gotoProjects(page: Page) {
  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Card count once the measured page size has settled. The grid re-measures on
 * a ResizeObserver tick after every viewport change, so the count is polled
 * until two consecutive reads agree rather than read once.
 */
async function settledCardCount(page: Page): Promise<number> {
  const cards = projectCards(page);
  let last = -1;
  await expect
    .poll(
      async () => {
        const current = await cards.count();
        const stable = current > 0 && current === last;
        last = current;
        return stable;
      },
      {
        message: "project grid should settle on a measured page size",
        timeout: 20_000,
        intervals: [250, 250, 500, 500, 1000],
      }
    )
    .toBe(true);
  return last;
}

test.describe("projects grid — viewport-measured page size", () => {
  test("fills the viewport without pushing a row below the fold", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoProjects(page);

    const emptyState = page.getByText(/No projects found/i);
    if (await emptyState.isVisible().catch(() => false)) {
      test.skip(true, "account has no projects — nothing to measure");
    }

    const count = await settledCardCount(page);

    const layout = await page.evaluate(() => {
      const scroller = document.querySelector("main");
      const grid = document.querySelector<HTMLElement>("main .grid");
      if (!scroller || !grid) return null;

      const columns = getComputedStyle(grid)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length;
      const lastCard = grid.lastElementChild?.getBoundingClientRect();

      return {
        columns,
        scrollerBottom: scroller.getBoundingClientRect().bottom,
        lastCardBottom: lastCard?.bottom ?? 0,
      };
    });

    expect(layout, "projects grid should be present in the DOM").not.toBeNull();
    const { columns, scrollerBottom, lastCardBottom } = layout!;

    // A partial last row means the measurement rounded the wrong way: the
    // page size is columns x rows, so a full page is always a multiple of
    // the column count. Only the FINAL page may be short.
    const totalText = await page
      .getByText(/showing \d+-\d+ of \d+/)
      .textContent()
      .catch(() => null);
    const isLastPage =
      !totalText ||
      (() => {
        const [, end, total] = totalText.match(/showing \d+-(\d+) of (\d+)/)!;
        return Number(end) === Number(total);
      })();

    if (!isLastPage) {
      expect(
        count % columns,
        `a full page should be a whole number of rows (${count} cards across ${columns} columns)`
      ).toBe(0);
    }

    // The whole point of measuring: the last row must be visible without
    // scrolling. One row of slack absorbs sub-pixel layout rounding.
    expect(
      lastCardBottom,
      "the last project row should sit inside the scroll viewport"
    ).toBeLessThanOrEqual(scrollerBottom + 1);

    expect(clientErrors, "no client errors on the projects grid").toEqual([]);
  });

  test("a taller viewport shows more projects per page", async ({ page }) => {
    test.setTimeout(90_000);

    await page.setViewportSize({ width: 1440, height: 700 });
    await gotoProjects(page);

    const emptyState = page.getByText(/No projects found/i);
    if (await emptyState.isVisible().catch(() => false)) {
      test.skip(true, "account has no projects — nothing to measure");
    }

    const shortCount = await settledCardCount(page);

    // Only meaningful when the short viewport was actually saturated —
    // otherwise every project already fits and there is nothing to grow.
    const paginationBar = page.getByText(/showing \d+-\d+ of \d+/);
    const isPaginated = await paginationBar.isVisible().catch(() => false);
    test.skip(
      !isPaginated,
      "account has too few projects to fill a 700px viewport"
    );

    await page.setViewportSize({ width: 1440, height: 1400 });
    const tallCount = await settledCardCount(page);

    expect(
      tallCount,
      `a 1400px viewport should fit more cards than a 700px one (${tallCount} vs ${shortCount})`
    ).toBeGreaterThan(shortCount);
  });
});
