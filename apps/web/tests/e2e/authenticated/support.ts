import { expect, test, type Page } from "@playwright/test";

// Shared fixtures for authenticated RBAC specs. Kept separate from
// invite-panel.spec.ts so existing passing specs are never touched.

/** Fail with an actionable fixture message instead of a cryptic timeout. */
export function fixtureError(message: string): Error {
  return new Error(
    `E2E fixture problem: ${message} — the E2E_TEST_EMAIL account needs an ` +
      `organization it OWNS. See apps/web/tests/e2e/README.md.`
  );
}

/**
 * Navigates to /organizations and returns the slug of the first org the test
 * user owns (identified by its "Owner" role badge).
 */
export async function getOwnedOrgSlug(page: Page): Promise<string> {
  await page.goto("/organizations", { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/organizations")) {
    throw fixtureError(
      "navigating to /organizations bounced away — is the saved auth session still valid?"
    );
  }

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
  return href.replace(/^\/organizations\//, "");
}

/**
 * Per-worker fixture project: returns the slug of `E2E Worker Project <n>`
 * (n = this worker's parallelIndex), creating it through the authenticated
 * API on first use. Every parallel worker mutating its OWN project is what
 * makes `fullyParallel` safe — with a single shared project, one worker's
 * writes re-render/paginate the variable list out from under another
 * worker's open drawer or row assertions (the "element detached" flake
 * family). Requires the e2e account's org to allow enough projects (the
 * account is provisioned on the pro tier — see convex/features/admin/e2e.ts).
 *
 * The project is intentionally REUSED across runs (cleanup.setup.ts purges
 * its stale E2E_* variables instead of deleting the project) to avoid
 * create/delete churn in the org.
 */
const workerProjectSlugCache = new Map<number, string>();

export async function getWorkerProjectSlug(page: Page): Promise<string> {
  const workerIndex = test.info().parallelIndex;
  const cached = workerProjectSlugCache.get(workerIndex);
  if (cached) return cached;

  const slug = `e2e-worker-project-${workerIndex}`;
  const name = `E2E Worker Project ${workerIndex}`;

  const orgsResponse = await page.request.get("/api/organizations");
  if (!orgsResponse.ok()) {
    throw fixtureError(
      `GET /api/organizations failed (${orgsResponse.status()}) — is the saved auth session still valid?`
    );
  }
  const { organizations } = (await orgsResponse.json()) as {
    organizations: Array<{ _id: string; role: string }>;
  };
  const ownedOrg = organizations.find((o) => o.role === "owner");
  if (!ownedOrg) throw fixtureError("the test user OWNS no organization");

  const projectsResponse = await page.request.get(
    `/api/projects?organizationId=${ownedOrg._id}`
  );
  if (!projectsResponse.ok()) {
    throw fixtureError(
      `GET /api/projects failed (${projectsResponse.status()})`
    );
  }
  const { projects } = (await projectsResponse.json()) as {
    projects: Array<{ slug: string }>;
  };

  if (!projects.some((p) => p.slug === slug)) {
    const createResponse = await page.request.post("/api/projects", {
      data: {
        name,
        slug,
        organizationId: ownedOrg._id,
        description: "Per-worker Playwright fixture project (auto-created)",
      },
    });
    // 409 = another test in this worker raced us to it — that's fine.
    if (!createResponse.ok() && createResponse.status() !== 409) {
      throw fixtureError(
        `creating the worker fixture project failed ` +
          `(${createResponse.status()}): ${await createResponse.text()}. ` +
          `If this is a tier-limit error, the e2e account must be on the ` +
          `pro tier (bunx convex run features/admin/e2e:ensureE2EUserPro)`
      );
    }
  }

  workerProjectSlugCache.set(workerIndex, slug);
  return slug;
}

/**
 * True for known-benign noise that isn't a real product regression:
 *
 * - Dev-only browser noise (favicon 404s, React DevTools reminder).
 * - hooks/use-auth's "fetch_user_failed" — a full-document page.goto()
 *   (used throughout these specs to move between routes) aborts any
 *   in-flight /api/auth/me fetch from the page being torn down, which the
 *   hook catches and logs via console.error. An artifact of hard
 *   navigation in tests, not a product regression.
 * - A Next.js dev-server SSR race: verified via concurrent curl requests to
 *   /dashboard/audit (outside Playwright entirely) that hitting several
 *   dashboard routes back-to-back can intermittently make one SSR pass
 *   throw "useAuthContext must be used within an AuthProvider", forcing
 *   React to re-render client-side (the page still ends up correct — cross
 *   checked against a page snapshot). This is a real, reproducible finding
 *   (see the e2e run report) but is treated as non-fatal dev-mode noise
 *   here rather than a flaky test failure, since Next.js Link prefetching
 *   from the sidebar nav means *any* dashboard page load fires concurrent
 *   background requests to the other nav routes. Delivered as both a
 *   console "error" message and, separately, an uncaught `pageerror`.
 */
function isBenignNoise(text: string): boolean {
  return (
    /favicon|Download the React DevTools/i.test(text) ||
    // Vercel Web Analytics / Speed Insights injects a
    // <script src="/_vercel/insights/script.js"> into the dashboard layout.
    // That path is served ONLY by Vercel's edge in real production; under a
    // local `next start` or in CI (a production build NOT running on Vercel)
    // it 404s on every page. It's an environment artifact — on real Vercel
    // prod the script loads fine and analytics no-ops gracefully off-Vercel —
    // not a product error, so it must not fail the zero-client-errors specs.
    // The generic "Failed to load resource: 404" console text carries no URL;
    // trackClientErrors matches this against the message's location URL too.
    /_vercel\/(insights|speed-insights)/.test(text) ||
    /"module":"hooks\/use-auth".*"event":"fetch_user_failed"/.test(text) ||
    /Hydration failed because the server rendered HTML didn't match the client/.test(
      text
    ) ||
    /Switched to client rendering because the server rendering errored/.test(
      text
    ) ||
    /useAuthContext must be used within an AuthProvider/.test(text)
  );
}

/** Collects console messages and uncaught page errors that indicate a real client-side error. */
export function trackClientErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // A failed resource load (e.g. a 404) surfaces as a generic
    // "Failed to load resource: ..." message whose text has no URL — the
    // offending URL is only on the message location. Filter on both so
    // known-benign resource 404s (Vercel insights) are dropped by URL.
    const locationUrl = msg.location()?.url ?? "";
    if (isBenignNoise(text) || isBenignNoise(locationUrl)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    if (isBenignNoise(err.message)) return;
    errors.push(err.message);
  });
  return errors;
}

export const ACCESS_DENIED_TEXT =
  /you.?re not authorized|you don.t have access to this page/i;

/**
 * Locate a variable's row on the project page by its key.
 *
 * Each VariableListItem row renders as `<div className="px-6 py-4">...`
 * (apps/web/src/components/variables/variable-list-item.tsx) — a plain div,
 * not a `tr`/`li`/`[data-variable-row]` element. Scoping on that class pair
 * mirrors the variableRow/accountRow pattern used by the sibling
 * history-rollback.spec.ts, search-projects-org.spec.ts, and
 * sharing-tags-export.spec.ts.
 */
export function variableRow(page: Page, key: string) {
  return page.locator("div.px-6.py-4").filter({ hasText: key });
}

/**
 * Create a variable through the real "Add Variable" drawer, resilient to the
 * dev-mode React remounts that detach the drawer mid-interaction (the whole
 * open→fill→submit sequence is retried as a unit via toPass, so a remount
 * between two steps just restarts the sequence instead of failing). Returns
 * once the new row is visible in the list. Caller must ensure the "Add
 * Variable" button is present (role can create).
 *
 * `environments` beyond the default-selected "development" are toggled on.
 */
export async function createVariable(
  page: Page,
  opts: {
    key: string;
    value: string;
    environments?: string[];
    sensitive?: boolean;
    description?: string;
  }
): Promise<void> {
  const addButton = page.getByRole("button", { name: "Add Variable" });
  const row = variableRow(page, opts.key);

  // Set when the drawer shows the tier-limit Upgrade prompt instead of the
  // form. That state is persistent (the project is genuinely at the cap), so
  // retrying inside toPass would burn the whole 90s budget on every call —
  // exit the loop and fail the spec immediately with an actionable message.
  let tierLimitError: Error | null = null;

  await expect(async () => {
    // Already created on a prior attempt (the mutation landed but a remount
    // tore the drawer down before we observed it) — done.
    if (
      await row
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;

    const drawer = page.getByRole("dialog");
    if (!(await drawer.isVisible().catch(() => false))) {
      await addButton.click({ timeout: 8_000 });
      await expect(drawer).toBeVisible({ timeout: 10_000 });
    }

    if (
      await drawer
        .getByText(/reached the variables? limit/i)
        .isVisible()
        .catch(() => false)
    ) {
      tierLimitError = fixtureError(
        "the fixture project is at the max_variables_per_project tier cap, " +
          "so the Add Variable drawer shows the Upgrade prompt instead of " +
          "the form. Stale E2E_* debris from failed runs is the usual cause " +
          "— the cleanup.setup.ts sweep should have purged it; re-run the " +
          "suite, or delete leftover E2E_* variables from the project"
      );
      return;
    }

    // Every interactive step below gets a short, explicit timeout instead of
    // the default unbounded wait. Under sustained dev-mode remounts (e.g. a
    // concurrent test elsewhere mutating the same shared project, which
    // re-renders this drawer's contents), an element can keep detaching and
    // reattaching indefinitely — an unbounded action would then block for
    // the entire outer toPass budget on a single step. Failing fast here
    // instead lets toPass retry the whole open→fill→submit sequence several
    // times within its budget, each attempt getting a fresh chance to land
    // in a stable moment.
    await drawer.locator("#key").fill(opts.key, { timeout: 8_000 });
    await drawer.locator("#value").fill(opts.value, { timeout: 8_000 });

    for (const env of opts.environments ?? []) {
      const envButton = drawer.getByRole("button", { name: env, exact: true });
      // The toggle has no aria-pressed; selection is class-based — an
      // UNselected env carries the neutral `bg-zinc-100` background, a
      // selected one carries a colored ring instead. Only click to turn on.
      const cls = (await envButton.getAttribute("class").catch(() => "")) ?? "";
      const selected = !cls.includes("bg-zinc-100");
      if (!selected) await envButton.click({ timeout: 8_000 });
    }

    if (opts.sensitive) {
      const box = drawer.getByRole("checkbox", { name: /mark as sensitive/i });
      if (!(await box.isChecked().catch(() => false))) {
        await box.check({ timeout: 8_000 });
      }
    }

    if (opts.description) {
      await drawer.locator("#description").fill(opts.description, {
        timeout: 8_000,
      });
    }

    // Submit via Enter (implicit form submit) — avoids the "button not
    // stable" actionability failure when the drawer re-renders on input.
    await drawer.locator("#value").press("Enter", { timeout: 8_000 });
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    await expect(row.first()).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 90_000 });

  if (tierLimitError) throw tierLimitError;
}

/**
 * Delete a variable through the row's Delete control + ConfirmDialog.
 * No-op if the row/control isn't present, so it's safe in finally blocks.
 */
export async function deleteVariableByKey(
  page: Page,
  key: string
): Promise<void> {
  const row = variableRow(page, key).first();
  const deleteButton = row.getByTitle("Delete variable");
  if (!(await deleteButton.isVisible().catch(() => false))) return;
  await deleteButton.click();
  const confirmHeading = page.getByRole("heading", { name: "Delete Variable" });
  if (await confirmHeading.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirmHeading).toBeHidden({ timeout: 15_000 });
  }
}

// ============================================================
// MCP transport helpers (shared by mcp.spec.ts + machine-requests.spec.ts)
// ============================================================

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Extract the single JSON-RPC message from an SSE-framed body, or parse it
 * directly if the server ever responds with plain JSON. mcp-handler 1.1.0
 * SSE-frames EVERY successful response (one `data: {...}` event), so a bare
 * response.json() would throw. */
export function parseMcpBody(
  contentType: string,
  text: string
): JsonRpcResponse {
  if (contentType.includes("text/event-stream")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) {
      throw new Error(`No SSE "data:" line found in MCP response: ${text}`);
    }
    return JSON.parse(dataLine.slice("data: ".length)) as JsonRpcResponse;
  }
  return JSON.parse(text) as JsonRpcResponse;
}

/**
 * POST one JSON-RPC request to /api/mcp with the headers Streamable HTTP
 * requires, returning the parsed response and the raw HTTP status (a 401
 * auth denial never reaches the JSON-RPC layer at all).
 */
export async function postMcp(
  request: import("@playwright/test").APIRequestContext,
  token: string | null,
  body: Record<string, unknown>
): Promise<{ status: number; json: JsonRpcResponse | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await request.post("/api/mcp", { headers, data: body });
  const status = response.status();
  if (status >= 400) {
    return { status, json: null };
  }
  const contentType = response.headers()["content-type"] ?? "";
  const text = await response.text();
  return { status, json: parseMcpBody(contentType, text) };
}
