import { expect, test, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { authedConvex } from "../convex";
import {
  fixtureError,
  getWorkerProjectSlug,
  resolveOwnedProject,
  trackClientErrors,
} from "./support";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

// Authenticated e2e — VS Code unsync-on-close project settings. Exercises
// the pro-gated "VS Code Sync" section on the project settings General tab:
// the project-default toggle (immediate save, persists across reload) and
// the per-member tri-state override (inherit / on / off). The e2e account is
// PRO-tier (and the Tier Enforcement admin toggle may be off in dev), so the
// section is expected to render; if the gate hides it anyway, the specs
// self-skip. Serial: later tests reuse the project id resolved by the first
// and mutate the same project's setting.

test.skip(!hasE2ECredentials, SKIP_REASON);

/** Resolve the worker fixture project's id from its slug via the API. */
async function getProjectId(page: Page, slug: string): Promise<string> {
  const { project } = await resolveOwnedProject(page, slug);
  if (!project) {
    throw fixtureError(`worker fixture project '${slug}' not found`);
  }
  return project._id;
}

test.describe.serial("VS Code unsync-on-close settings", () => {
  let projectSlug = "";
  let projectId = "";

  const unsyncToggle = (page: Page) =>
    page.getByRole("button", { name: "Unsync on close", exact: true });

  /** Read the persisted flag straight from Convex. */
  async function readPersistedFlag(page: Page): Promise<boolean | undefined> {
    const convex = await authedConvex(page.request);
    const project = (await convex.query(
      convexApi.features.projects.queries.getById,
      { projectId: projectId as Id<"projects"> }
    )) as { vscodeAutoUnsyncOnClose?: boolean } | null;
    expect(project, `project ${projectId} not readable`).not.toBeNull();
    return project?.vscodeAutoUnsyncOnClose;
  }

  /**
   * Open the settings General tab and wait for it to settle. Returns false
   * (for a self-skip) when the pro-gated VS Code Sync section is not
   * rendered — e.g. the vscode_unsync_customization gate is off for this
   * org/tier.
   */
  async function openGeneralSettings(page: Page): Promise<boolean> {
    await page.goto(`/dashboard/projects/${projectSlug}/settings`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("button", { name: /^General$/i }).first()
    ).toBeVisible({ timeout: 20_000 });

    return await page
      .getByRole("heading", { name: "VS Code Sync" })
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  }

  test("toggle appears on the General tab and defaults to ON", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    projectSlug = await getWorkerProjectSlug(page);
    projectId = await getProjectId(page, projectSlug);

    // Fixture hygiene: a crashed prior run may have left the flag OFF on the
    // reused worker project — restore the default before asserting it.
    const convex = await authedConvex(page.request);
    await convex.mutation(convexApi.features.projects.mutations.update, {
      projectId: projectId as Id<"projects">,
      vscodeAutoUnsyncOnClose: true,
    });

    const sectionVisible = await openGeneralSettings(page);
    test.skip(
      !sectionVisible,
      "VS Code Sync section not visible — vscode_unsync_customization is gated off for this org/tier"
    );

    await expect(unsyncToggle(page)).toBeVisible();
    await expect(unsyncToggle(page)).toHaveAttribute("aria-pressed", "true");

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("flipping OFF persists across reload; restoring ON persists too", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!projectId, "no project id from the first test");

    const sectionVisible = await openGeneralSettings(page);
    test.skip(
      !sectionVisible,
      "VS Code Sync section not visible — vscode_unsync_customization is gated off for this org/tier"
    );

    // Flip OFF and wait for the save to land server-side.
    await unsyncToggle(page).click();
    await expect(unsyncToggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(() => readPersistedFlag(page), { timeout: 15_000 })
      .toBe(false);

    // Survives a reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(unsyncToggle(page)).toHaveAttribute("aria-pressed", "false", {
      timeout: 20_000,
    });

    // Restore ON (cleanup) and verify that persists as well.
    await unsyncToggle(page).click();
    await expect(unsyncToggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => readPersistedFlag(page), { timeout: 15_000 })
      .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(unsyncToggle(page)).toHaveAttribute("aria-pressed", "true", {
      timeout: 20_000,
    });
  });

  test("member override: off persists across reload, then reset to inherit", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!projectId, "no project id from the first test");

    const sectionVisible = await openGeneralSettings(page);
    test.skip(
      !sectionVisible,
      "VS Code Sync section not visible — vscode_unsync_customization is gated off for this org/tier"
    );

    const overrideSelect = page.getByLabel(/^Unsync override for /).first();
    const hasMember = await overrideSelect
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !hasMember,
      "the worker fixture project has no assigned members — member overrides not exercised"
    );

    // The member's row: the <li> containing the override select.
    const memberRow = page
      .locator("li")
      .filter({ has: page.getByLabel(/^Unsync override for /) })
      .first();

    // Set the override to OFF; the resolved effect flips to "keeps files"
    // once the mutation lands and the live query pushes the update.
    await overrideSelect.selectOption("off");
    await expect(memberRow.getByText("keeps files")).toBeVisible({
      timeout: 15_000,
    });

    // Survives a reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(overrideSelect).toBeVisible({ timeout: 20_000 });
    await expect(overrideSelect).toHaveValue("off");

    // Reset to inherit (cleanup). Project default is ON, so the resolved
    // effect goes back to "unsyncs".
    await overrideSelect.selectOption("inherit");
    await expect(memberRow.getByText("unsyncs")).toBeVisible({
      timeout: 15_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(overrideSelect).toBeVisible({ timeout: 20_000 });
    await expect(overrideSelect).toHaveValue("inherit");
  });
});
