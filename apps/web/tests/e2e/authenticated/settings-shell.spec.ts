import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_PROJECT_COLOR, PROJECT_COLORS } from "@/constants/project";
import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getOwnedOrgSlug, getWorkerProjectSlug } from "./support";

// The three settings surfaces now share one shell: tabs are data, `?tab=` is
// the source of truth, and a settings tab renders flat sections — no cards.
// The nesting assertion is the regression net for the design rule: the moment
// someone wraps a section in a bordered container again, this fails.

test.skip(!hasE2ECredentials, SKIP_REASON);

/** A settings body must never nest one bordered/ringed box inside another. */
async function countNestedBorderedBoxes(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return -1;

    const bordered = (el: Element) => {
      const s = getComputedStyle(el);
      const hasBorder =
        parseFloat(s.borderTopWidth) > 0 ||
        parseFloat(s.borderLeftWidth) > 0 ||
        parseFloat(s.borderRightWidth) > 0;
      // A ring compiles to a box-shadow spread; the inset highlight alone
      // (shadow-panel) does not count as a container edge.
      const hasRing =
        s.boxShadow.includes("rgb") && !s.boxShadow.includes("inset");
      return hasBorder || hasRing;
    };

    // Controls legitimately own a border — they are the one allowed level.
    const isControl = (el: Element) =>
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "KBD"].includes(
        el.tagName
      ) || el.closest("button,a,input,textarea,select") !== null;

    const boxes = Array.from(main.querySelectorAll("div,section,form")).filter(
      (el) => bordered(el) && !isControl(el)
    );

    return boxes.filter((el) =>
      boxes.some((other) => other !== el && other.contains(el))
    ).length;
  });
}

/**
 * Deep-links every tab of one surface and runs the nesting probe on each.
 * A tab that is hidden (absent from the rail) or locked (disabled) for this
 * account is skipped rather than failed — the rail is capability-gated.
 */
async function assertEveryTabStaysFlat(
  page: Page,
  opts: {
    href: (tab: string) => string;
    heading: RegExp;
    /** `?tab=` id paired with the rail button's exact label. */
    tabs: { id: string; label: string }[];
  }
) {
  const checked: string[] = [];

  for (const tab of opts.tabs) {
    await page.goto(opts.href(tab.id), { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: opts.heading })
    ).toBeVisible({ timeout: 20_000 });
    // The rail only exists once the org/project query resolves — without this
    // wait every tab would "skip" itself against a still-loading page.
    await expect(
      page.getByRole("navigation", { name: "Settings sections" })
    ).toBeVisible({ timeout: 20_000 });

    const button = page.getByRole("button", { name: tab.label, exact: true });
    if ((await button.count()) === 0 || (await button.isDisabled())) {
      // Annotated rather than swallowed, so a tab that quietly stops being
      // offered shows up in the report instead of shrinking coverage.
      test.info().annotations.push({
        type: "skipped tab",
        description: `${tab.id} is hidden or locked for this account`,
      });
      continue;
    }

    await expect(button).toHaveAttribute("aria-current", "page");
    // The tab body renders under the rail; assert it has content so the probe
    // never reports a clean zero against an empty panel. Generous, because a
    // tab whose data comes over REST (billing) fills in well after the rail.
    await expect(
      page.locator("div.max-w-4xl").first(),
      `the "${tab.id}" tab rendered an empty body`
    ).not.toBeEmpty({ timeout: 30_000 });

    expect(
      await countNestedBorderedBoxes(page),
      `the "${tab.id}" tab wraps a settings section in another bordered container`
    ).toBe(0);
    checked.push(tab.id);
  }

  test.skip(
    checked.length === 0,
    "no tab on this surface is offered to the signed-in role"
  );
}

test.describe("settings shell", () => {
  test("account settings deep-links every tab and keeps it flat", async ({
    page,
  }) => {
    await assertEveryTabStaysFlat(page, {
      href: (tab) => `/dashboard/settings?tab=${tab}`,
      heading: /account settings/i,
      tabs: [
        { id: "general", label: "General" },
        { id: "notifications", label: "Notifications" },
        { id: "integrations", label: "Integrations" },
        { id: "security", label: "Security" },
        { id: "customization", label: "Customization" },
        { id: "billing", label: "Billing" },
      ],
    });
  });

  test("project settings deep-links every tab and keeps it flat", async ({
    page,
  }) => {
    const slug = await getWorkerProjectSlug(page);

    await assertEveryTabStaysFlat(page, {
      href: (tab) => `/dashboard/projects/${slug}/settings?tab=${tab}`,
      heading: /project settings/i,
      tabs: [
        { id: "general", label: "General" },
        { id: "integrations", label: "Integrations" },
        // Capability-gated: absent unless the role can delete the project.
        { id: "danger", label: "Danger zone" },
      ],
    });
  });

  test("organization settings deep-links every tab and keeps it flat", async ({
    page,
  }) => {
    const slug = await getOwnedOrgSlug(page);

    await assertEveryTabStaysFlat(page, {
      href: (tab) => `/organizations/${slug}/settings?tab=${tab}`,
      heading: /organization settings/i,
      tabs: [
        { id: "general", label: "General" },
        // Tags is tier-gated, the rest are owner-only locks.
        { id: "tags", label: "Tags" },
        { id: "apiKeys", label: "API Keys" },
        { id: "integrations", label: "Integrations" },
        { id: "danger", label: "Danger Zone" },
      ],
    });
  });

  test("deleting a project needs the name typed exactly", async ({ page }) => {
    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${slug}/settings?tab=danger`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("navigation", { name: "Settings sections" })
    ).toBeVisible({ timeout: 20_000 });

    const dangerTab = page.getByRole("button", {
      name: "Danger zone",
      exact: true,
    });
    test.skip(
      (await dangerTab.count()) === 0,
      "the signed-in role cannot delete projects, so the danger tab is not offered"
    );
    await expect(dangerTab).toHaveAttribute("aria-current", "page");

    await page
      .getByRole("button", { name: "Delete project", exact: true })
      .click();

    // aria-label, not a visible one — the transfer row has its own confirm box.
    const confirm = page.getByLabel("Project name confirmation", {
      exact: true,
    });
    await expect(confirm).toBeVisible();
    // The placeholder IS the project name, so the expected text comes from the
    // product rather than from a name this spec has to keep in sync.
    const projectName = await confirm.getAttribute("placeholder");
    expect(projectName).toBeTruthy();

    const destroy = page.getByRole("button", { name: /delete permanently/i });
    await expect(destroy).toBeDisabled();

    await confirm.fill(`${projectName} `);
    await expect(destroy, "a near-miss must not arm the delete").toBeDisabled();

    await confirm.fill(projectName!);
    await expect(destroy).toBeEnabled();

    // Never clicked — back out so the project is left exactly as found.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toBeHidden();
  });

  test("the colour picker selects the project's stored colour", async ({
    page,
  }) => {
    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${slug}/settings?tab=general`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible(
      { timeout: 20_000 }
    );

    // Swatches are the only hex-labelled controls on the surface.
    const swatches = page.locator('main button[aria-label^="#"]');
    test.skip(
      (await swatches.count()) === 0,
      "the fixture project uses a framework logo, which draws no colour ramp"
    );

    const rendered = await swatches.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? "")
    );
    expect(rendered).toEqual(
      expect.arrayContaining([...PROJECT_COLORS] as string[])
    );

    const pressed = page.locator(
      'main button[aria-label^="#"][aria-pressed="true"]'
    );
    await expect(pressed, "exactly one swatch is selected").toHaveCount(1);
    const selected = await pressed.getAttribute("aria-label");

    const response = await page.request.get("/api/projects");
    expect(response.ok()).toBe(true);
    const { projects } = (await response.json()) as {
      projects: { slug: string; color?: string }[];
    };
    const stored =
      projects.find((p) => p.slug === slug)?.color ?? DEFAULT_PROJECT_COLOR;

    // The whole point of the extra swatch: a colour from before this ramp must
    // stay rendered and selected, or saving silently overwrites it.
    expect(
      rendered,
      "the stored project colour is missing from the picker"
    ).toContain(stored);
    expect(selected, "the picker must preselect the stored colour").toBe(
      stored
    );
    if (!(PROJECT_COLORS as readonly string[]).includes(stored)) {
      expect(
        rendered.length,
        "an off-ramp colour must render as one extra swatch"
      ).toBe(PROJECT_COLORS.length + 1);
    }
  });

  test("the palette offers project settings from inside a project", async ({
    page,
  }) => {
    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });

    // The project page owns a "Search variables..." box of its own, so both
    // the input and the row are scoped to the palette overlay — the only
    // fixed z-[60] layer in the app.
    const palette = page.locator("div.fixed.inset-0.z-\\[60\\]");
    // The trigger is server-rendered before its click handler is attached, so
    // the first click can land on nothing — retry the open as a unit.
    await expect(async () => {
      await page
        .getByRole("button", { name: /^Search/ })
        .first()
        .click();
      await expect(palette).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });

    await palette.getByRole("textbox").fill("unsync");

    await expect(
      palette.getByTestId("palette-setting-project-integrations"),
      "project-scoped settings must be offered while inside a project"
    ).toBeVisible({ timeout: 15_000 });
  });

  test("unsaved changes block a tab switch", async ({ page }) => {
    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${slug}/settings?tab=general`, {
      waitUntil: "domcontentloaded",
    });

    // The form arrives with the Convex query, not with the document — waiting
    // on the field is what stops this test silently skipping itself.
    const description = page.getByLabel(/description/i).first();
    await expect(description).toBeVisible({ timeout: 20_000 });
    await description.fill(`E2E dirty ${Date.now()}`);

    // The save bar is the signal that the form went dirty.
    await expect(page.getByText(/unsaved change/i)).toBeVisible();

    // Leaving with edits must ask first. Assert the dialog actually fired and
    // the tab did NOT move: "save bar still visible" alone passes on the first
    // poll even when the switch is merely a frame away, which is how a dead
    // guard slipped through once already.
    const general = page.getByRole("button", { name: /^general$/i });
    const integrations = page.getByRole("button", { name: /^integrations$/i });

    let asked = false;
    page.once("dialog", (dialog) => {
      asked = true;
      dialog.dismiss();
    });
    await integrations.click();
    await expect.poll(() => asked, { timeout: 5_000 }).toBe(true);
    await expect(general).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/unsaved change/i)).toBeVisible();

    // Accepting the prompt lets the switch through and drops the edits.
    page.once("dialog", (dialog) => dialog.accept());
    await integrations.click();
    await expect(integrations).toHaveAttribute("aria-current", "page");
  });
});
