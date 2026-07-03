import {
  expect,
  test,
  request as apiRequest,
  type APIRequestContext,
} from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { E2E_TEST_EMAIL, hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

/**
 * Authenticated e2e — the org-wide variable-requests approvals page
 * (/dashboard/requests). Exercises the reviewer (owner) flow end to end:
 * reveal → env-chip toggle → approve, plus reject via ConfirmDialog, plus the
 * unauthenticated authorization guard on the value endpoint.
 *
 * ── Seeding ────────────────────────────────────────────────────────────────
 * Only org-role *developers* may submit variable requests (enforced by both
 * the POST /api/variable-requests route and the `variableRequests.create`
 * Convex mutation). The single E2E login is the fixture-org OWNER, so there is
 * no authenticated developer path from the browser. Instead this spec seeds
 * requests directly against the Convex dev deployment with a ConvexHttpClient,
 * passing `requestedBy = <fixture developer>` — the mutation's own role check
 * then passes because that user really is a developer assigned to the project.
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
  getByEmail: makeFunctionReference<"query">("users:getByEmail"),
  listForUser: makeFunctionReference<"query">("organizations:listForUser"),
  getBySlug: makeFunctionReference<"query">("projects:getBySlug"),
  listForReviewer: makeFunctionReference<"query">(
    "variableRequests:listForReviewer"
  ),
  getById: makeFunctionReference<"query">("variableRequests:getById"),
  create: makeFunctionReference<"mutation">("variableRequests:create"),
};

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

  const owner = await convex.query(fn.getByEmail, { email: E2E_TEST_EMAIL });
  if (!owner) {
    throw new Error(
      `No Convex user for E2E_TEST_EMAIL (${E2E_TEST_EMAIL}). Sign in through ` +
        "the app once so the fixture owner has a profile. See tests/e2e/README.md."
    );
  }

  const orgs = (await convex.query(fn.listForUser, {
    userId: owner._id,
  })) as Array<{ _id: string; name: string; role: string }>;
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
    userId: owner._id,
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
    userId: owner._id,
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

/** Seed a pending request as the fixture developer; returns its id + key. */
async function seedRequest(
  key: string,
  environments: string[]
): Promise<string> {
  const requestId = (await ctx.convex.mutation(fn.create, {
    key,
    vaultRef: ctx.vaultRef,
    environments,
    projectId: ctx.projectId,
    isSensitive: false,
    requestedBy: ctx.developerId,
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

    // Reveal → the value route is hit and plaintext appears.
    await row.getByTestId("request-value-toggle").click();
    await expect(revealedValue).toBeVisible({ timeout: 15_000 });
    const shown = (await revealedValue.textContent())?.trim() ?? "";
    expect(
      shown.length,
      "revealed plaintext should be non-empty"
    ).toBeGreaterThan(0);

    // Toggle an environment chip off then back on (leave it selected so the
    // approve below still targets development).
    const devChip = row.getByTestId("request-env-development");
    await expect(devChip).toHaveAttribute("aria-pressed", "true");
    await devChip.click();
    await expect(devChip).toHaveAttribute("aria-pressed", "false");
    await devChip.click();
    await expect(devChip).toHaveAttribute("aria-pressed", "true");

    // Approve → the row leaves the Pending list.
    await row.getByTestId("request-accept").click();
    await expect(
      page.getByTestId("request-row").filter({ hasText: key }),
      "approved request should disappear from the Pending tab"
    ).toHaveCount(0, { timeout: 20_000 });

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
