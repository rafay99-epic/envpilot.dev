import {
  expect,
  test,
  request as apiRequest,
  type APIRequestContext,
} from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { readFileSync } from "node:fs";

import {
  E2E_TEST_EMAIL,
  hasE2ECredentials,
  SKIP_REASON,
  STORAGE_STATE_PATH,
} from "../env";
import { trackClientErrors } from "./support";

/**
 * Authenticated e2e — the org-wide variable-requests approvals page
 * (/dashboard/requests). Exercises the reviewer (owner) flow end to end:
 * reveal → env-chip toggle → approve, plus reject via ConfirmDialog, plus the
 * unauthenticated authorization guard on the value endpoint.
 *
 * ── Seeding (post auth-cutover) ────────────────────────────────────────────
 * Only org-role *developers* may submit variable requests, and since the
 * Convex auth cutover every mutation derives its actor from a verified
 * identity — the old trick of passing `requestedBy = <fixture developer>`
 * from an unauthenticated client IS the impersonation hole the cutover
 * closed, so it can no longer work (by design).
 *
 * Reads now run through an owner-authenticated ConvexHttpClient (the saved
 * Playwright session → /api/auth/me → setAuth). Seeding uses the CLI's real
 * submit surface, `variableRequests:createForToken`, authenticated by a CLI
 * token belonging to the fixture DEVELOPER. Set `E2E_DEVELOPER_CLI_TOKEN` in
 * the root .env.local (mint one by running `envpilot login` as the fixture
 * developer, or copy an active token from the developer's CLI config). Tests
 * that need seeding self-skip when the token is absent; the read-only
 * authorization test (C) always runs.
 *
 * Nothing is hardcoded: the developer, org, project and a *real* vault ref are
 * all derived at runtime from the pre-existing fixture pending request
 * (TEST_SMOKE_REQUEST_VAR). We reuse that request's vaultRef so the reveal
 * endpoint returns a genuine plaintext value — approval only copies the
 * vaultRef into a new variable row and never mutates the vault object, so the
 * smoke request is left completely untouched (the user keeps it for manual
 * testing).
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const FIXTURE_ORG_NAME = /E2E Fixture Org/i;
const FIXTURE_PROJECT_SLUG = "e2e-fixture-project";
const SMOKE_KEY = "TEST_SMOKE_REQUEST_VAR"; // pre-existing — never touched
const FIXTURE_PROJECT_NAME = "E2E Fixture Project";

// Untyped function references (avoids importing the generated `api`, which
// lives under a path alias the Playwright transpiler doesn't resolve).
const fn = {
  getByEmail: makeFunctionReference<"query">("features/users/users:getByEmail"),
  listForUser: makeFunctionReference<"query">(
    "features/organizations/queries:listForUser"
  ),
  getBySlug: makeFunctionReference<"query">(
    "features/projects/queries:getBySlug"
  ),
  listForReviewer: makeFunctionReference<"query">(
    "features/variables/requests/queries:listForReviewer"
  ),
  getById: makeFunctionReference<"query">(
    "features/variables/requests/queries:getById"
  ),
  createForToken: makeFunctionReference<"mutation">(
    "features/variables/requests/mutations:createForToken"
  ),
};

/** CLI token of the fixture DEVELOPER — required only by the seeding tests. */
const DEVELOPER_CLI_TOKEN = process.env.E2E_DEVELOPER_CLI_TOKEN;
const DEVELOPER_TOKEN_SKIP =
  "Skipped: set E2E_DEVELOPER_CLI_TOKEN in the root .env.local (an active " +
  "CLI token of the fixture developer) so this spec can seed requests " +
  "through the real CLI submit surface. See the seeding notes at the top of " +
  "this file.";

/**
 * The owner's WorkOS access token, obtained exactly like the app does:
 * saved session cookies → GET /api/auth/me. Convex then verifies the JWT on
 * every fixture read (post-cutover, unauthenticated reads are rejected).
 */
async function fetchOwnerAccessToken(): Promise<string> {
  const state = JSON.parse(readFileSync(STORAGE_STATE_PATH, "utf-8")) as {
    cookies: Array<{ name: string; value: string; domain: string }>;
  };
  const cookieHeader = state.cookies
    .filter((c) => c.domain.includes("localhost"))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const res = await fetch("http://localhost:3000/api/auth/me", {
    headers: { Cookie: cookieHeader },
  });
  if (!res.ok) {
    throw new Error(
      `GET /api/auth/me failed (${res.status}) — is the saved e2e session ` +
        "still valid? Re-run the setup project."
    );
  }
  const me = (await res.json()) as { accessToken: string | null };
  if (!me.accessToken) {
    throw new Error("/api/auth/me returned no accessToken for the e2e owner.");
  }
  return me.accessToken;
}

interface FixtureContext {
  convex: ConvexHttpClient;
  ownerId: string;
  developerId: string;
  developerEmail: string;
  orgId: string;
  projectId: string;
  vaultRef: string;
  smokeRequestId: string;
}

let ctx: FixtureContext;

function uniqueKey(tag: string): string {
  return `E2E_REQ_${tag}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

async function resolveFixtureContext(): Promise<FixtureContext> {
  if (!CONVEX_URL) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set — the root .env.local must define it " +
        "(loaded via tests/e2e/env.ts) so the spec can seed requests."
    );
  }
  const convex = new ConvexHttpClient(CONVEX_URL);
  convex.setAuth(await fetchOwnerAccessToken());

  const owner = await convex.query(fn.getByEmail, { email: E2E_TEST_EMAIL });
  if (!owner) {
    throw new Error(
      `No Convex user for E2E_TEST_EMAIL (${E2E_TEST_EMAIL}). Sign in through ` +
        "the app once so the fixture owner has a profile. See tests/e2e/README.md."
    );
  }

  const orgs = (await convex.query(fn.listForUser, {})) as Array<{
    _id: string;
    name: string;
    role: string;
  }>;
  const org = orgs.find((o) => FIXTURE_ORG_NAME.test(o.name));
  if (!org) {
    throw new Error(
      "The E2E owner does not belong to an 'E2E Fixture Org'. Create the " +
        "fixture org/project/developer as documented in tests/e2e/README.md."
    );
  }

  const project = (await convex.query(fn.getBySlug, {
    organizationId: org._id,
    slug: FIXTURE_PROJECT_SLUG,
  })) as { _id: string; name: string } | null;
  if (!project) {
    throw new Error(
      `Fixture project '${FIXTURE_PROJECT_SLUG}' not found in the E2E Fixture Org.`
    );
  }

  // Derive the developer + a real vault ref from the pre-existing smoke request.
  const pending = (await convex.query(fn.listForReviewer, {
    organizationId: org._id,
    status: "pending",
  })) as Array<{
    _id: string;
    key: string;
    requestedBy: string;
    requester: { email: string } | null;
  }>;
  const smoke = pending.find((r) => r.key === SMOKE_KEY);
  if (!smoke) {
    throw new Error(
      `The pre-existing '${SMOKE_KEY}' pending request is missing. It is the ` +
        "seed source for the fixture developer + a real vault ref."
    );
  }

  const full = (await convex.query(fn.getById, {
    requestId: smoke._id,
  })) as { vaultRef: string } | null;
  if (!full?.vaultRef) {
    throw new Error("Could not read a vault ref from the smoke request.");
  }

  return {
    convex,
    ownerId: owner._id,
    developerId: smoke.requestedBy,
    developerEmail: smoke.requester?.email ?? "",
    orgId: org._id,
    projectId: project._id,
    vaultRef: full.vaultRef,
    smokeRequestId: smoke._id,
  };
}

const ACTIVE_ORG_COOKIE = "envpilot_active_org";

/**
 * Pin the browser's active organization to the fixture org. The requests page
 * reads this cookie (via useAuth → selectActiveOrganization) to choose which
 * org's requests to show; the owner belongs to several orgs, so without this
 * the page may load a different org and never show the seeded rows.
 */
async function pinActiveOrg(
  context: import("@playwright/test").BrowserContext
): Promise<void> {
  await context.addCookies([
    {
      name: ACTIVE_ORG_COOKIE,
      value: encodeURIComponent(ctx.orgId),
      url: "http://localhost:3000",
    },
  ]);
}

/**
 * Seed a pending request AS the fixture developer through the CLI's real
 * submit surface — the developer's identity comes from their CLI token,
 * validated inside Convex (requireBearerUser).
 */
async function seedRequest(
  key: string,
  environments: string[]
): Promise<string> {
  const requestId = (await ctx.convex.mutation(fn.createForToken, {
    accessToken: DEVELOPER_CLI_TOKEN!,
    key,
    vaultRef: ctx.vaultRef,
    environments,
    projectId: ctx.projectId,
    isSensitive: false,
  })) as string;
  return requestId;
}

test.beforeAll(async () => {
  test.setTimeout(60_000);
  ctx = await resolveFixtureContext();
});

test.describe("variable requests — reviewer approvals page", () => {
  test("A: reveal → toggle env → approve moves the request to Approved", async ({
    page,
  }) => {
    test.skip(!DEVELOPER_CLI_TOKEN, DEVELOPER_TOKEN_SKIP);
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    const key = uniqueKey("A");
    await seedRequest(key, ["development"]);
    await pinActiveOrg(page.context());

    await page.goto("/dashboard/requests", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("requests-page")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "Variable Requests" })
    ).toBeVisible({ timeout: 20_000 });

    // Locate our seeded row (Pending is the default tab). Convex is reactive:
    // the client resolves getByWorkosId → listForReviewer a few seconds after
    // load, so give the auto-retrying assertion a generous timeout. (Do NOT
    // reload in a loop — that restarts the async chain and never lets it settle.)
    const row = page
      .getByTestId("request-row")
      .filter({ hasText: key })
      .first();
    await expect(
      row,
      "seeded pending request should appear on the Pending tab"
    ).toBeVisible({ timeout: 30_000 });

    // Row content: key, project name, requester email, development env chip.
    await expect(row).toContainText(key);
    await expect(row).toContainText(FIXTURE_PROJECT_NAME);
    if (ctx.developerEmail) {
      await expect(row).toContainText(ctx.developerEmail);
    }
    await expect(row.getByTestId("request-env-development")).toBeVisible();

    // Value must be hidden before the toggle is clicked (revealed value uses a
    // green <code>; nothing green until we fetch it).
    const revealedValue = row.locator("code.text-green-400");
    await expect(revealedValue).toHaveCount(0);

    // Reveal → toggle env off/on → approve, retried as a unit: RequestRow
    // keeps its reveal/toggle state in local React state, so a dev-mode
    // remount of this row (e.g. the pending-list Convex subscription
    // re-rendering mid-click) resets it back to its initial props — a plain
    // one-shot `.click()` sequence can then hit a detached-element
    // actionability timeout. Each guard re-reads live DOM state instead of
    // assuming a prior attempt's progress survived, so a mid-sequence
    // remount just replays the remaining steps rather than failing, and the
    // final approve click never fires twice (it only runs while the row is
    // still on the Pending tab).
    await expect(async () => {
      // Already approved by a prior attempt whose final disappearance check
      // simply hadn't caught up yet (e.g. the toHaveCount(0) below timed out
      // on websocket lag, not on a real failure) — nothing left to do, and
      // re-entering the steps below would find a vanished row.
      const pendingRow = page
        .getByTestId("request-row")
        .filter({ hasText: key });
      if ((await pendingRow.count()) === 0) return;

      // Reveal — idempotent: skip the click if a remount already re-revealed
      // it via cached parent-level state (see handleToggleReveal).
      if (!(await revealedValue.isVisible().catch(() => false))) {
        await row.getByTestId("request-value-toggle").click();
        await expect(revealedValue).toBeVisible({ timeout: 15_000 });
      }
      const shown = (await revealedValue.textContent())?.trim() ?? "";
      expect(
        shown.length,
        "revealed plaintext should be non-empty"
      ).toBeGreaterThan(0);

      // Toggle an environment chip off then back on (leave it selected so
      // the approve below still targets development). A remount resets the
      // chip to its initial (pressed) state, so only toggle off if it isn't
      // already off.
      const devChip = row.getByTestId("request-env-development");
      const pressed = await devChip.getAttribute("aria-pressed");
      if (pressed !== "false") {
        await expect(devChip).toHaveAttribute("aria-pressed", "true");
        await devChip.click();
        await expect(devChip).toHaveAttribute("aria-pressed", "false");
      }
      await devChip.click();
      await expect(devChip).toHaveAttribute("aria-pressed", "true");

      // Approve → the row leaves the Pending list.
      await row.getByTestId("request-accept").click();
      await expect(
        page.getByTestId("request-row").filter({ hasText: key }),
        "approved request should disappear from the Pending tab"
      ).toHaveCount(0, { timeout: 20_000 });
    }).toPass({ timeout: 60_000 });

    // Switch to Approved → the request is there.
    await page.getByRole("button", { name: "Approved" }).click();
    const approvedRow = page
      .getByTestId("request-row")
      .filter({ hasText: key })
      .first();
    await expect(
      approvedRow,
      "approved request should be listed on the Approved tab"
    ).toBeVisible({ timeout: 30_000 });

    // Optional, non-fatal: the approved variable should now exist.
    await page.goto("/dashboard/variables", { waitUntil: "domcontentloaded" });
    const variableCell = page.getByText(key, { exact: false }).first();
    const variableVisible = await variableCell
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!variableVisible) {
      test.info().annotations.push({
        type: "note",
        description:
          "approved variable not visible in the (possibly paginated/filtered) variables list — request approval already verified",
      });
    }

    expect(
      clientErrors,
      `unexpected client-side errors on the requests page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("B: reject via ConfirmDialog moves the request to Rejected", async ({
    page,
  }) => {
    test.skip(!DEVELOPER_CLI_TOKEN, DEVELOPER_TOKEN_SKIP);
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    const key = uniqueKey("B");
    await seedRequest(key, ["development"]);
    await pinActiveOrg(page.context());

    await page.goto("/dashboard/requests", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("requests-page")).toBeVisible({
      timeout: 20_000,
    });

    const row = page
      .getByTestId("request-row")
      .filter({ hasText: key })
      .first();
    await expect(
      row,
      "seeded pending request should appear on the Pending tab"
    ).toBeVisible({ timeout: 30_000 });

    // Reject opens a ConfirmDialog (a Modal — a fixed full-screen overlay,
    // not an ARIA dialog role — so match it by its heading + overlay container).
    await row.getByTestId("request-reject").click();
    const dialog = page.locator("div.fixed.inset-0.z-50").filter({
      hasText: "Reject Variable Request",
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.getByRole("heading", { name: "Reject Variable Request" })
    ).toBeVisible();

    // Confirm inside the dialog (scope the click so it isn't the row button).
    await dialog.getByRole("button", { name: /^Reject$/ }).click();

    await expect(
      page.getByTestId("request-row").filter({ hasText: key }),
      "rejected request should disappear from the Pending tab"
    ).toHaveCount(0, { timeout: 20_000 });

    // Switch to Rejected → the request is there.
    await page.getByRole("button", { name: "Rejected" }).click();
    const rejectedRow = page
      .getByTestId("request-row")
      .filter({ hasText: key })
      .first();
    await expect(
      rejectedRow,
      "rejected request should be listed on the Rejected tab"
    ).toBeVisible({ timeout: 30_000 });

    expect(
      clientErrors,
      `unexpected client-side errors on the requests page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("C: the value endpoint rejects an unauthenticated request", async () => {
    // A fresh APIRequestContext with no storage state → no session cookies.
    // Force an EMPTY storage state so this context carries no session cookies
    // (newContext would otherwise inherit the authenticated project's
    // storageState). maxRedirects:0 keeps the middleware's 307 → hosted WorkOS
    // sign-in from being followed to a 200 HTML page that would mask the denial.
    const anon: APIRequestContext = await apiRequest.newContext({
      baseURL: "http://localhost:3000",
      maxRedirects: 0,
      storageState: { cookies: [], origins: [] },
    });
    try {
      // Any request id works — auth is checked before the id is resolved. Use
      // the real smoke request id (read-only; the row is never modified).
      const res = await anon.get(
        `/api/variable-requests/${ctx.smokeRequestId}/value`
      );
      const status = res.status();
      // Denied either by the route (401/403) or by the middleware redirect to
      // sign-in (3xx). The one thing that must never happen is a 200 that
      // returns the secret value.
      expect(
        [301, 302, 303, 307, 308, 401, 403],
        `unauthenticated value fetch must be denied (redirect or 401/403), got ${status}`
      ).toContain(status);
      expect(status, "unauthenticated caller must not get a 200").not.toBe(200);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe("variable requests — project-level requests page", () => {
  test("D: the sidebar Requests item navigates to the project requests page and lists the seeded request", async ({
    page,
  }) => {
    test.skip(!DEVELOPER_CLI_TOKEN, DEVELOPER_TOKEN_SKIP);
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    const key = uniqueKey("D");
    await seedRequest(key, ["development"]);
    await pinActiveOrg(page.context());

    await page.goto(`/dashboard/projects/${FIXTURE_PROJECT_SLUG}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Environment Variables" })
    ).toBeVisible({ timeout: 20_000 });

    // Project context swaps the sidebar to project-level items — "Requests"
    // is unambiguous here (the org-wide "Requests" item only shows outside
    // project context). Scope to the desktop sidebar to avoid the hidden
    // mobile-menu duplicate.
    const requestsLink = page
      .locator("aside")
      .getByRole("link", { name: /Requests/ });
    await expect(requestsLink).toBeVisible({ timeout: 20_000 });
    await requestsLink.click();

    await expect(page).toHaveURL(
      new RegExp(`/dashboard/projects/${FIXTURE_PROJECT_SLUG}/requests$`)
    );
    await expect(
      page.getByRole("heading", { name: "Requests", level: 1 })
    ).toBeVisible({ timeout: 20_000 });

    // The seeded pending request is reactive (Convex WebSocket) — give it
    // room to arrive rather than reloading in a loop.
    await expect(
      page.getByText(key),
      "seeded pending request should appear on the project requests page"
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("pending").first()).toBeVisible();

    // The e2e owner is a reviewer (team_lead+), so the row links out to the
    // org-wide review page rather than exposing inline actions here.
    await expect(page.getByRole("link", { name: "Review →" })).toBeVisible();

    expect(
      clientErrors,
      `unexpected client-side errors on the project requests page: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });
});
