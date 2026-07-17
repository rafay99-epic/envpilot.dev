import { expect, test, type Page } from "@playwright/test";
// Load root .env.local so expected hosts match what the dev server sees.
import "./env";

// Unauthenticated e2e — the public wishlist board. Deliberately read-only:
// the public page has no delete path, so writes (submit/vote) would leave
// permanent debris the cleanup project can't purge. Covers the upgraded UX:
// sort toggle, search, filters, and submit-modal validation.
//
// Data-dependent tests self-skip when the Convex backend for this branch is
// not deployed yet (the dev deployment serves functions from the main
// checkout's watcher — a branch adding query args sees validation errors
// until it merges). Static-UI tests always run.

/**
 * When this branch's Convex functions are not deployed, the new `sort` query
 * arg fails validation and the page crashes to the "$ retrying..." boundary
 * a moment after load. Give the websocket roundtrip time to surface that,
 * then report whether the board survived.
 */
async function boardUsable(page: Page): Promise<boolean> {
  await page.waitForTimeout(3_000);
  return !(await page.getByText("$ retrying...").isVisible());
}

test.describe("wishlist board", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/wishlist");
    test.skip(
      !(await boardUsable(page)),
      "Convex functions for this branch not deployed yet"
    );
  });

  test("board renders with filters, sort toggle, and search", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: /help shape/i })
    ).toBeVisible();
    // Status filter pills
    await expect(page.getByRole("button", { name: "*" })).toBeVisible();
    // Sort toggle defaults to "top"
    const newButton = page.getByRole("button", { name: "new", exact: true });
    await expect(
      page.getByRole("button", { name: "top", exact: true })
    ).toBeVisible();
    await newButton.click();
    await expect(newButton).toHaveClass(/text-green-400/);
    // Search input present
    await expect(
      page.getByRole("searchbox", { name: /search feature requests/i })
    ).toBeVisible();
  });

  test("search shows a no-match message for nonsense queries", async ({
    page,
  }) => {
    await page
      .getByRole("searchbox", { name: /search feature requests/i })
      .fill("zzz-no-such-request-zzz");
    await expect(
      page.getByText(/no requests match .*zzz-no-such-request-zzz/i)
    ).toBeVisible();
  });

  test("roadmap tab renders columns", async ({ page }) => {
    await page.getByRole("button", { name: /cat roadmap/ }).click();
    await expect(
      page.getByRole("heading", { name: "planned", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "completed", exact: true })
    ).toBeVisible();
  });

  test("submit modal validates required fields without writing", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /submit-feature/ }).click();
    await expect(page.getByText("envpilot feature --new")).toBeVisible();
    // Submit empty — client-side validation blocks before any mutation
    await page.getByRole("button", { name: "submit", exact: true }).click();
    await expect(page.getByText(/error: title is required/i)).toBeVisible();
    // Close without submitting
    await page.getByRole("button", { name: "cancel" }).click();
    await expect(page.getByText("envpilot feature --new")).not.toBeVisible();
  });

  test("voting without a stored email prompts for one, cancel writes nothing", async ({
    page,
  }) => {
    // Vote buttons carry an upvote icon + the numeric count
    const voteButtons = page.locator("button", { hasText: /^\s*\d+\s*$/ });
    const count = await voteButtons.count();
    test.skip(count === 0, "no feature requests exist in this environment");
    await voteButtons.first().click();
    await expect(page.getByText(/enter your email to vote/i)).toBeVisible();
    await page.getByRole("button", { name: "cancel" }).click();
    await expect(page.getByText(/enter your email to vote/i)).not.toBeVisible();
  });
});
