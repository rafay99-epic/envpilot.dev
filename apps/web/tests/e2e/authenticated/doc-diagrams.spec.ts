import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getWorkerProjectSlug, trackClientErrors } from "./support";

/**
 * Authenticated e2e — mermaid diagrams in project documentation.
 *
 * The dashboard reader is react-markdown, not MDX, so the MDX pipeline's
 * remark plugin does not apply here: diagrams come from a `pre` component
 * override. That makes three things worth asserting through the real UI.
 *
 *   1. A ```mermaid fence renders an <svg>, not a code block.
 *   2. A BROKEN diagram falls back to its own source instead of blanking the
 *      page — the editor's live preview parses on every keystroke, so most
 *      renders it attempts are of half-written diagrams.
 *   3. A fixed diagram recovers. The previous renderer wrote into a ref that
 *      is unmounted while the fallback shows, so once a diagram failed it
 *      could never render again in that component instance.
 *
 * Serial: each test builds on the page the first one creates.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

const STAMP = Date.now();
const MODULE_NAME = `E2E Diagrams ${STAMP}`;
const TITLE = `E2E Diagram Page ${STAMP}`;

const GOOD_DIAGRAM = [
  "# Flow",
  "",
  "```mermaid",
  "flowchart TD",
  "  A[Request] --> B[Gate chain]",
  "  B --> C[Page]",
  "```",
  "",
].join("\n");

// `flowchart` with a bare arrow and no target is a parse error, not a
// rendering quirk — mermaid rejects it outright.
const BROKEN_DIAGRAM = [
  "# Flow",
  "",
  "```mermaid",
  "flowchart TD",
  "  A[Request] -->",
  "```",
  "",
].join("\n");

test.describe.serial("Documentation diagrams", () => {
  let projectSlug = "";
  let docSlug = "";

  test("a mermaid fence renders as a diagram", async ({ page }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    projectSlug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${projectSlug}/docs/new`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-title-input").fill(TITLE);
    await page.getByTestId("doc-module-input").fill(MODULE_NAME);
    await page.getByTestId("doc-type-guide").click();
    await page.getByTestId("doc-create-submit").click();

    await expect(page.getByTestId("doc-title")).toHaveText(TITLE, {
      timeout: 20_000,
    });
    docSlug = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(docSlug.length).toBeGreaterThan(0);

    await page.getByTestId("doc-edit").click();
    const body = page.getByTestId("doc-body-input");
    await expect(body).toBeVisible({ timeout: 15_000 });
    await body.fill(GOOD_DIAGRAM);
    await page.getByTestId("doc-save").click();

    // mermaid is a dynamic import, so the first render waits on a chunk.
    const svg = page.getByTestId("doc-body").locator("svg").first();
    await expect(svg).toBeVisible({ timeout: 30_000 });

    // The fence must NOT also survive as literal source text.
    await expect(page.getByTestId("doc-body")).not.toContainText("```mermaid");

    expect(
      clientErrors.filter((line) => !line.includes("mermaid")),
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("a broken diagram falls back to its source, then recovers", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!docSlug, "no page from the first test");

    const url = `/dashboard/projects/${projectSlug}/docs/${docSlug}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.getByTestId("doc-edit").click();
    const body = page.getByTestId("doc-body-input");
    await expect(body).toBeVisible({ timeout: 15_000 });
    await body.fill(BROKEN_DIAGRAM);
    await page.getByTestId("doc-save").click();

    // An author must never lose text to a syntax error: the source shows.
    const rendered = page.getByTestId("doc-body");
    await expect(rendered).toContainText("flowchart TD", { timeout: 30_000 });
    await expect(rendered.locator("svg")).toHaveCount(0);

    // Fix it. The whole point of holding the SVG in state rather than a ref:
    // a component that has already failed can still render the next attempt.
    await page.getByTestId("doc-edit").click();
    await expect(body).toBeVisible({ timeout: 15_000 });
    await body.fill(GOOD_DIAGRAM);
    await page.getByTestId("doc-save").click();

    await expect(rendered.locator("svg").first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("the editor's split preview renders the diagram live", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!docSlug, "no page from the first test");

    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-edit").click();

    const split = page.getByTestId("doc-editor-split");
    if ((await split.count()) === 0) {
      test.skip(true, "this editor build has no split mode toggle");
    }
    await split.click();

    await expect(
      page.getByTestId("doc-preview").locator("svg").first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async ({ browser }) => {
    // Reruns stay green: the page is trashed, not left to collide with the
    // next stamp's module listing.
    if (!docSlug || !projectSlug) return;
    const page = await browser.newPage();
    try {
      await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
        waitUntil: "domcontentloaded",
      });
      const remove = page.getByTestId("doc-delete");
      if (await remove.isVisible().catch(() => false)) {
        await remove.click();
        await page.getByRole("button", { name: /move to trash/i }).click();
      }
    } catch {
      // Cleanup is best-effort — a failure here must not fail the suite.
    } finally {
      await page.close();
    }
  });
});
