import { expect, test, type Locator, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";

// Authenticated e2e — the org members invite panel. Runs in the
// "authenticated" Playwright project with the AuthKit session saved by
// tests/e2e/auth.setup.ts. Skips cleanly when credentials are absent.

test.skip(!hasE2ECredentials, SKIP_REASON);

/** Fail with an actionable fixture message instead of a cryptic timeout. */
function fixtureError(message: string): Error {
  return new Error(
    `E2E fixture problem: ${message} — the E2E_TEST_EMAIL account needs an ` +
      `organization it OWNS containing at least one project. Create one via ` +
      `the web UI, then re-run. See apps/web/tests/e2e/README.md.`
  );
}

/**
 * Navigates to /organizations, picks the first org the test user owns
 * (identified by its "Owner" role badge) and opens its members page.
 */
async function openOwnedOrgMembersPage(page: Page): Promise<void> {
  await page.goto("/organizations", { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/organizations")) {
    throw fixtureError(
      "navigating to /organizations bounced away — is the saved auth session still valid?"
    );
  }

  // Org cards live in <main>; exclude the "New Organization" link which also
  // points under /organizations/. Wait until the Convex query settles: either
  // cards render or the empty state appears.
  const orgCards = page.locator(
    'main a[href^="/organizations/"]:not([href="/organizations/new"])'
  );
  const emptyState = page.getByText("No organizations yet");
  await expect(orgCards.first().or(emptyState), {
    message:
      "the organizations page never finished loading (no org cards, no empty state)",
  }).toBeVisible({ timeout: 30_000 });

  if (await emptyState.isVisible()) {
    throw fixtureError("the test user has no organizations");
  }

  const ownedOrg = orgCards.filter({ hasText: "Owner" }).first();
  if ((await ownedOrg.count()) === 0) {
    throw fixtureError(
      "the test user has organizations but OWNS none (no 'Owner' badge found)"
    );
  }

  const href = await ownedOrg.getAttribute("href");
  if (!href) throw fixtureError("could not resolve the owned org's link");
  await page.goto(`${href}/members`, { waitUntil: "domcontentloaded" });
}

/** Sets a checkbox to the desired state regardless of its default. */
async function setChecked(checkbox: Locator, checked: boolean): Promise<void> {
  if ((await checkbox.isChecked()) !== checked) {
    await checkbox.click();
  }
}

test.describe("org members invite panel", () => {
  test("invites a developer with a restricted environment scope", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // (a) The members page renders with an Invite button.
    await openOwnedOrgMembersPage(page);
    const inviteButton = page.getByRole("button", { name: /invite member/i });
    await expect(
      inviteButton,
      "members page should render an 'Invite Member' button (owner-only UI)"
    ).toBeVisible({ timeout: 20_000 });

    // (b) Clicking it opens the side panel sliding from the right.
    await inviteButton.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer, "invite drawer should open").toBeVisible({
      timeout: 10_000,
    });
    await expect(drawer).toContainText("Invite Team Member");

    const emailInput = drawer
      .locator('input#email, input[type="email"]')
      .first();
    const roleSelect = drawer.locator("select#role, select").first();
    await expect(
      emailInput,
      "drawer should show the email input"
    ).toBeVisible();
    await expect(
      roleSelect,
      "drawer should show the role select"
    ).toBeVisible();

    // (c) Role "Developer" + at least one project reveals "Environment access".
    await emailInput.fill("e2e-invitee@example.com");
    await roleSelect.selectOption({ label: "Developer" });

    const projectsSection = drawer.getByText("Assign to Projects");
    if (!(await projectsSection.isVisible().catch(() => false))) {
      throw fixtureError(
        "the invite panel shows no 'Assign to Projects' section — the owned org has no projects"
      );
    }
    const firstProjectCheckbox = drawer
      .locator("label", { hasText: /.+/ })
      .filter({ has: page.locator('input[type="checkbox"]') })
      .filter({ hasNotText: /development|staging|production/i })
      .locator('input[type="checkbox"]')
      .first();
    await setChecked(firstProjectCheckbox, true);

    const envHeading = drawer.getByText(/environment access/i);
    await expect(
      envHeading,
      "selecting Developer + a project should reveal the 'Environment access' section"
    ).toBeVisible({ timeout: 10_000 });

    // (d) Uncheck production, keep development, and intercept the POST so no
    //     real invitation email is ever sent.
    const envCheckbox = (env: string) =>
      drawer
        .locator("label", { hasText: new RegExp(`^\\s*${env}\\s*$`, "i") })
        .locator('input[type="checkbox"]')
        .first();
    await setChecked(envCheckbox("development"), true);
    await setChecked(envCheckbox("production"), false);

    let interceptedBody: Record<string, unknown> | undefined;
    await page.route(
      (url) => /\/api\/organizations\/[^/]+\/members$/.test(url.pathname),
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        interceptedBody = route.request().postDataJSON() as Record<
          string,
          unknown
        >;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            invitation: {
              id: "e2e-mocked-invitation",
              email: "e2e-invitee@example.com",
              role: "developer",
              status: "pending",
            },
            emailSent: true,
            emailError: null,
          }),
        });
      }
    );

    await drawer.getByRole("button", { name: /send invitation/i }).click();

    await expect
      .poll(() => interceptedBody, {
        message:
          "expected the invite form to POST /api/organizations/*/members",
        timeout: 15_000,
      })
      .toBeTruthy();

    expect(interceptedBody?.email).toBe("e2e-invitee@example.com");
    expect(interceptedBody?.role).toBe("developer");
    const environments = interceptedBody?.environments;
    expect(Array.isArray(environments), "body should carry environments").toBe(
      true
    );
    expect(environments).toContain("development");
    expect(environments).not.toContain("production");
    const projectIds = interceptedBody?.projectIds;
    expect(Array.isArray(projectIds) && projectIds.length >= 1).toBe(true);

    // (e) Panel closes / resets on success.
    await expect(
      drawer,
      "drawer should close after a successful invite"
    ).toBeHidden({ timeout: 10_000 });
  });
});
