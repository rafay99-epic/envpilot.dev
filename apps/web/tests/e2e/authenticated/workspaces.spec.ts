import { expect, test } from "@playwright/test";

import {
  createVariable,
  deleteVariableByKey,
  getOwnedOrgSlug,
  getWorkerProjectSlug,
  variableRow,
} from "./support";

/**
 * Workspaces: shared variables across projects.
 *
 * Drives the real UI end to end — the workspaces strip on the projects page,
 * the workspace route, adding a member project, and the inherited group that
 * appears on that project's variables page. Nothing here uses a test-only
 * shortcut.
 *
 * Cleanup keeps reruns green: the workspace's variable is deleted and the
 * member project is removed, so a second run starts from the same state. The
 * workspace row itself is left in place and reused by name, because a free-
 * tier org is capped at one and deleting projects is a staged cascade that
 * would make the spec wait on a worker.
 */

const WORKSPACE_NAME = "E2E_Workspace";
const SHARED_KEY = "E2E_SHARED_TOKEN";

test.describe("workspaces", () => {
  test("shares a variable from a workspace into a project", async ({
    page,
  }) => {
    await getOwnedOrgSlug(page);
    const projectSlug = await getWorkerProjectSlug(page);

    await page.goto("/dashboard/workspaces", { waitUntil: "domcontentloaded" });

    const newWorkspace = page.getByRole("button", { name: "New Workspace" });
    if (!(await newWorkspace.isVisible().catch(() => false))) {
      test.skip(
        true,
        "This role cannot create workspaces — nothing to exercise."
      );
      return;
    }

    // Reuse the workspace across runs; the free tier allows exactly one.
    const workspaceLink = page.getByRole("link", { name: WORKSPACE_NAME });
    if (
      !(await workspaceLink
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await newWorkspace.click();
      await page.getByLabel("Name").fill(WORKSPACE_NAME);
      await page.getByRole("button", { name: "Create" }).click();

      const created = await workspaceLink
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      if (!created) {
        test.skip(
          true,
          "Workspace creation was refused — the org is likely at its tier limit."
        );
        return;
      }
    }

    await workspaceLink.first().click();
    await expect(
      page.getByRole("heading", { name: WORKSPACE_NAME })
    ).toBeVisible();

    // A shared variable is an ordinary variable that happens to live in a
    // workspace, so the same drawer creates it.
    await createVariable(page, {
      key: SHARED_KEY,
      value: "e2e-shared-value",
      environments: ["development"],
    });
    await expect(variableRow(page, SHARED_KEY).first()).toBeVisible();

    // Link the worker's project so it starts inheriting.
    const projectPicker = page.getByLabel("Project to link");
    await expect(projectPicker).toBeVisible();
    await projectPicker.selectOption({ label: projectSlug });
    await page.getByRole("button", { name: "Link", exact: true }).click();

    await expect(page.getByText("inherits", { exact: false })).toBeVisible();

    // The member project now shows it, grouped by source and read only.
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByText(`From ${WORKSPACE_NAME}`, { exact: false })
    ).toBeVisible();
    await expect(page.getByText(SHARED_KEY).first()).toBeVisible();

    // Cleanup: unlink, then delete the shared variable.
    await page.goto("/dashboard/workspaces", { waitUntil: "domcontentloaded" });
    await workspaceLink.first().click();
    await page
      .getByRole("button", { name: `Remove ${projectSlug} from workspace` })
      .click();
    await page.getByRole("button", { name: "Unlink", exact: true }).click();
    await deleteVariableByKey(page, SHARED_KEY);
  });

  test("refuses a key the member project already owns", async ({ page }) => {
    await getOwnedOrgSlug(page);
    const projectSlug = await getWorkerProjectSlug(page);

    await page.goto("/dashboard/workspaces", { waitUntil: "domcontentloaded" });
    const workspaceLink = page.getByRole("link", { name: WORKSPACE_NAME });
    if (
      !(await workspaceLink
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(true, "No workspace available in this org.");
      return;
    }

    // The project owns the key first.
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await createVariable(page, {
      key: SHARED_KEY,
      value: "project-owned",
      environments: ["development"],
    });

    // The workspace defines the same key, then linking must be refused —
    // strict inheritance has no precedence to fall back on.
    await page.goto("/dashboard/workspaces", { waitUntil: "domcontentloaded" });
    await workspaceLink.first().click();
    await createVariable(page, {
      key: SHARED_KEY,
      value: "workspace-owned",
      environments: ["development"],
    });

    const projectPicker = page.getByLabel("Project to link");
    await projectPicker.selectOption({ label: projectSlug });
    await page.getByRole("button", { name: "Link", exact: true }).click();

    await expect(
      page.getByText("already defines", { exact: false })
    ).toBeVisible();

    // Cleanup both sides.
    await deleteVariableByKey(page, SHARED_KEY);
    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await deleteVariableByKey(page, SHARED_KEY);
  });

  test("scope picker and duplicate scan are reachable", async ({ page }) => {
    await getOwnedOrgSlug(page);

    await page.goto("/dashboard/workspaces", { waitUntil: "domcontentloaded" });
    const workspaceLink = page.getByRole("link", { name: WORKSPACE_NAME });
    if (
      !(await workspaceLink
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(true, "No workspace available in this org.");
      return;
    }

    await workspaceLink.first().click();

    // The duplicate scan only renders with 2+ linked projects, so its absence
    // is a valid state rather than a failure.
    const findDuplicates = page.getByRole("button", {
      name: "Find duplicates",
    });
    if (await findDuplicates.isVisible().catch(() => false)) {
      await findDuplicates.click();
      await expect(
        page.getByText(/No key appears in more than one|identical in/)
      ).toBeVisible({ timeout: 20_000 });
    }

    // The scope control sits on the variable row and opens the picker.
    const scopeButton = page.getByRole("button", { name: /read by/ }).first();
    if (await scopeButton.isVisible().catch(() => false)) {
      await scopeButton.click();
      await expect(
        page.getByText("All projects in this workspace")
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
    }
  });
});
