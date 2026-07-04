import { expect, test, type Locator, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  ACCESS_DENIED_TEXT,
  getFirstProjectSlug,
  getOwnedOrgSlug,
  trackClientErrors,
} from "./support";

// Authenticated e2e — proves the perf/convex-cleanup backend rewrite didn't
// break three surfaces it touched directly or indirectly:
//   A. Global search (command palette) — globalSearchWithAccess was
//      rewritten to cap results and trim its returned fields.
//   B. Project lifecycle (create/edit/favorite/delete) — sanity sweep of the
//      surface the search fixture (a variable) lives inside.
//   C. Organization settings — the dead teamLeadsCanCreateProjects toggle
//      was removed end-to-end; asserts the page still renders real content
//      and the toggle is gone for good.
//   D. Usage dashboard — the tierLimits usage queries behind it were
//      rewritten to a capped-scan pattern; asserts the meters still resolve
//      to real numbers instead of getting stuck loading or erroring.

test.skip(!hasE2ECredentials, SKIP_REASON);

/**
 * Variable rows render as `<div className="px-6 py-4">...`
 * (apps/web/src/components/variables/variable-list-item.tsx), same class
 * pair convention as accountRow in accounts.spec.ts / trash-restore.spec.ts.
 */
function variableRow(page: Page, key: string): Locator {
  return page.locator("div.px-6.py-4").filter({ hasText: key });
}

/**
 * Drops dev-server lifecycle noise from the collected client errors: when
 * `next dev` restarts mid-session (common on this always-running local
 * server), the page logs HMR websocket reconnect failures that have nothing
 * to do with the product. The functional assertions in each test are the
 * real signal; this only keeps the console-error check from flaking on
 * infrastructure blips.
 */
function withoutDevServerNoise(errors: string[]): string[] {
  return errors.filter((e) => !/webpack-hmr|ERR_CONNECTION_REFUSED/.test(e));
}

test.describe("global search (command palette)", () => {
  test("finds a variable by key and navigates to its project", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getFirstProjectSlug(page);
    test.skip(
      slug === null,
      "the owned org has no projects yet — nothing to search for"
    );

    const uniqueKey = `E2E_SEARCH_${Date.now()}`;
    let created = false;

    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Environment Variables" })
    ).toBeVisible({ timeout: 20_000 });

    const addButton = page.getByRole("button", {
      name: /^(Add Variable|Request Variable)/,
    });
    await expect(addButton).toBeVisible({ timeout: 20_000 });
    const canCreate = (await addButton.textContent())?.includes("Add Variable");
    test.skip(
      !canCreate,
      "signed-in role can only request variables, not create them — cannot fixture a searchable variable"
    );

    try {
      // ── Create a uniquely-keyed variable to search for ──
      // Retried as a unit: a dev-mode remount can detach the drawer mid-fill
      // ("element is not stable" / detached-from-DOM). The row-visible guard
      // at the top makes a retry after a successful-but-slow submit a no-op
      // instead of a duplicate create.
      const createDrawer = page.getByRole("dialog");
      await expect(async () => {
        if (
          await variableRow(page, uniqueKey)
            .isVisible()
            .catch(() => false)
        ) {
          return; // a previous attempt already created it
        }
        if (!(await createDrawer.isVisible().catch(() => false))) {
          await addButton.click();
          await expect(createDrawer).toBeVisible({ timeout: 10_000 });
        }
        await createDrawer.locator("#key").fill(uniqueKey);
        await createDrawer.locator("#value").fill("e2e-search-value");
        // Submit via Enter (implicit form submission) instead of clicking
        // "Create Variable": the drawer's framer-motion spring keeps the
        // button "not stable" for Playwright's click actionability check
        // when the dev server is compiling and starving the rAF loop.
        await createDrawer.locator("#value").press("Enter");
        await expect(
          createDrawer,
          "create drawer should close on success"
        ).toBeHidden({ timeout: 15_000 });
      }).toPass({ timeout: 60_000 });
      created = true;

      await expect(
        variableRow(page, uniqueKey),
        "created variable should appear in the project's list"
      ).toBeVisible({ timeout: 20_000 });

      // ── Open the command palette via its sidebar trigger ──
      const searchTrigger = page.getByRole("button", { name: /^Search/ });
      await expect(searchTrigger).toBeVisible({ timeout: 20_000 });
      await searchTrigger.click();

      const searchInput = page.getByPlaceholder(
        "Search variables across all projects..."
      );
      await expect(searchInput).toBeVisible({ timeout: 10_000 });
      await searchInput.fill(uniqueKey);

      // globalSearchWithAccess debounces 300ms client-side, then resolves
      // over the Convex websocket — poll instead of a fixed sleep.
      const resultButton = page
        .locator("button")
        .filter({ hasText: uniqueKey });
      await expect(
        resultButton,
        "the newly-created variable should appear in global search results"
      ).toBeVisible({ timeout: 15_000 });

      // ── Selecting the result navigates to the variable's project ──
      await resultButton.first().click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${slug}$`), {
        timeout: 15_000,
      });
      // Palette should be closed after navigating.
      await expect(searchInput).toBeHidden({ timeout: 10_000 });

      // ── Cleanup: delete the fixture variable ──
      const row = variableRow(page, uniqueKey);
      await row.getByTitle("Delete variable").click();
      const confirmHeading = page.getByRole("heading", {
        name: "Delete Variable",
      });
      await expect(confirmHeading).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirmHeading).toBeHidden({ timeout: 15_000 });
      created = false;

      await expect(
        variableRow(page, uniqueKey),
        "deleted variable should no longer be present"
      ).toHaveCount(0, { timeout: 20_000 });
    } finally {
      if (created) {
        // Best-effort cleanup if an assertion above threw before the
        // in-flow delete step ran.
        const cleanupRow = variableRow(page, uniqueKey);
        const cleanupDeleteButton = cleanupRow.getByTitle("Delete variable");
        if (await cleanupDeleteButton.isVisible().catch(() => false)) {
          await cleanupDeleteButton.click();
          const confirmDeleteButton = page.getByRole("button", {
            name: "Delete",
            exact: true,
          });
          if (await confirmDeleteButton.isVisible().catch(() => false)) {
            await confirmDeleteButton.click();
          }
        }
      }
    }

    expect(
      withoutDevServerNoise(clientErrors),
      `unexpected client-side errors during the global search flow: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});

test.describe("project lifecycle", () => {
  test("create, edit, favorite/unfavorite, and delete a project", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({
      timeout: 20_000,
    });

    const newProjectLink = page.getByRole("link", { name: /New Project/i });
    const canCreate = await newProjectLink
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !canCreate,
      "signed-in role cannot create projects — nothing to exercise the lifecycle against"
    );

    const projectName = `E2E Project ${Date.now()}`;
    const projectDescription = "Created by search-projects-org.spec.ts";
    const editedDescription = `${projectDescription} (edited)`;

    // ── Create via the real /dashboard/projects/new form ──
    // Clicking immediately after load can race Next.js hydration (the Link
    // handler isn't attached yet, so the click is swallowed) — retry the
    // click until the navigation actually happens.
    await expect(async () => {
      await newProjectLink.click();
      await page.waitForURL(/\/dashboard\/projects\/new$/, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "Create New Project" })
    ).toBeVisible({ timeout: 20_000 });

    // "Start from Scratch" is the null-template option surfaced by the
    // TemplateSelector; the create button stays disabled until a template
    // (or scratch) is chosen.
    await page.getByRole("button", { name: /Start from Scratch/i }).click();

    await page.locator("#name").fill(projectName);
    // Leave the auto-generated slug as-is (unique via the name's timestamp).

    const createButton = page.getByRole("button", { name: "Create Project" });
    await expect(createButton).toBeEnabled({ timeout: 10_000 });
    await createButton.click();

    // Successful creation redirects to the new project's detail page (a
    // slug that is NOT the /new form itself).
    await page.waitForURL(
      (url) =>
        /\/dashboard\/projects\/[^/]+$/.test(url.pathname) &&
        !url.pathname.endsWith("/new"),
      { timeout: 20_000 }
    );
    const projectSlug = page.url().split("/dashboard/projects/")[1];

    try {
      // ── Appears in the projects list ──
      await page.goto("/dashboard/projects", {
        waitUntil: "domcontentloaded",
      });
      const projectCard = page.locator(
        `a[href="/dashboard/projects/${projectSlug}"]`
      );
      await expect(
        projectCard,
        "newly created project should appear in the projects grid"
      ).toBeVisible({ timeout: 20_000 });
      await expect(projectCard.getByText(projectName)).toBeVisible();

      // ── Favorite / unfavorite via the card's star control ──
      const favoriteButton = projectCard.getByTitle(/favorites/i);
      await expect(favoriteButton).toBeVisible();
      await expect(favoriteButton).toHaveAttribute("title", "Add to favorites");

      await favoriteButton.click();
      await expect(favoriteButton).toHaveAttribute(
        "title",
        "Remove from favorites",
        { timeout: 10_000 }
      );

      await favoriteButton.click();
      await expect(favoriteButton).toHaveAttribute(
        "title",
        "Add to favorites",
        { timeout: 10_000 }
      );

      // ── Edit name/description via project settings ──
      await page.goto(`/dashboard/projects/${projectSlug}/settings`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByRole("heading", { name: "Project Settings" })
      ).toBeVisible({ timeout: 20_000 });

      // Wait until the form has hydrated with the fetched project (the name
      // field is populated) before touching it.
      await expect(page.getByRole("textbox").first()).toHaveValue(projectName, {
        timeout: 20_000,
      });

      // Fill + save inside a retry block: the dev server's known SSR-noise
      // client re-render (see support.ts) can remount the page between
      // actions and reset local form state, which would otherwise save an
      // empty description.
      const descriptionField = page.locator("textarea").first();
      await expect(async () => {
        await descriptionField.fill(editedDescription);
        await expect(descriptionField).toHaveValue(editedDescription);
        await page.getByRole("button", { name: "Save Changes" }).click();
        await expect(
          page.getByText("Project updated successfully")
        ).toBeVisible({ timeout: 10_000 });
        await expect(descriptionField).toHaveValue(editedDescription);
      }).toPass({ timeout: 45_000 });

      // Prove real persistence (not just local state): reload and confirm
      // the description round-tripped through the API.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("textarea").first()).toHaveValue(
        editedDescription,
        { timeout: 20_000 }
      );

      // ── Delete via the danger-zone ConfirmDialog, asserting the 7-day
      // retention disclosure copy shipped alongside vault GC (PR #80) ──
      const dangerTab = page.getByRole("button", { name: "Danger Zone" });
      await expect(dangerTab).toBeVisible({ timeout: 10_000 });
      await dangerTab.click();

      await expect(
        page.getByText(/7-day retention before permanent deletion/i)
      ).toBeVisible({ timeout: 10_000 });

      await page
        .getByRole("button", { name: "Delete Project", exact: true })
        .click();
      await page
        .locator('input[placeholder="' + projectName + '"]')
        .fill(projectName);
      await page
        .getByRole("button", { name: "Delete Project", exact: true })
        .click();

      await expect(page).toHaveURL(/\/dashboard\/projects$/, {
        timeout: 20_000,
      });
      await expect(
        page.locator(`a[href="/dashboard/projects/${projectSlug}"]`),
        "deleted project should no longer be present in the list"
      ).toHaveCount(0, { timeout: 20_000 });
    } catch (err) {
      // Best-effort cleanup so a failed assertion above doesn't leave a
      // stray project behind for subsequent runs.
      await page
        .goto(`/dashboard/projects/${projectSlug}/settings`, {
          waitUntil: "domcontentloaded",
        })
        .catch(() => {});
      const dangerTab = page.getByRole("button", { name: "Danger Zone" });
      if (await dangerTab.isVisible().catch(() => false)) {
        await dangerTab.click();
        const deleteBtn = page.getByRole("button", {
          name: "Delete Project",
          exact: true,
        });
        if (await deleteBtn.isVisible().catch(() => false)) {
          await deleteBtn.click();
          const confirmInput = page.locator(
            'input[placeholder="' + projectName + '"]'
          );
          if (await confirmInput.isVisible().catch(() => false)) {
            await confirmInput.fill(projectName);
            await page
              .getByRole("button", { name: "Delete Project", exact: true })
              .click();
          }
        }
      }
      throw err;
    }

    expect(
      withoutDevServerNoise(clientErrors),
      `unexpected client-side errors during the project lifecycle flow: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});

test.describe("organization settings render post-cleanup", () => {
  test("general settings render and the dead team-leads toggle is gone", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getOwnedOrgSlug(page);
    await page.goto(`/organizations/${slug}/settings`, {
      waitUntil: "domcontentloaded",
    });

    // Real content renders: the General tab, org name field, and Plan card.
    await expect(
      page.getByRole("heading", { name: "Organization Settings" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText("Organization Name", { exact: false })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible();

    // The teamLeadsCanCreateProjects toggle was removed end-to-end
    // (perf/convex-cleanup) — assert it never shows up anywhere on the page,
    // under any tab.
    const deadToggleText = /team leads?.*(create|can create).*project/i;
    await expect(page.getByText(deadToggleText)).toHaveCount(0);

    const dangerTab = page.getByRole("button", { name: "Danger Zone" });
    await expect(dangerTab).toBeVisible();
    await dangerTab.click();
    await expect(
      page.getByRole("heading", { name: "Danger Zone" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(deadToggleText)).toHaveCount(0);

    expect(
      withoutDevServerNoise(clientErrors),
      `unexpected client-side errors on organization settings: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});

test.describe("usage dashboard renders after query capping", () => {
  test("usage meters render with real numbers", async ({ page }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard/usage", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(ACCESS_DENIED_TEXT)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /usage/i }).first()
    ).toBeVisible({ timeout: 20_000 });

    // "Projects" is always-rendered (unlike the gated extended meters) — its
    // label sits in the same ResourceMeter block as a UsageMeter that prints
    // either "<current> / <limit>" or "Unlimited". Its `current` value comes
    // straight out of the rewritten capped-scan tierLimits usage query, so
    // seeing a real value here proves the query still returns data instead
    // of getting stuck loading or throwing.
    await expect(page.getByText("Projects", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page
        .getByText(/^\d+ \/ (\d+|∞)$/)
        .or(page.getByText("Unlimited"))
        .first()
    ).toBeVisible({ timeout: 20_000 });

    expect(
      withoutDevServerNoise(clientErrors),
      `unexpected client-side errors on the usage dashboard: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
