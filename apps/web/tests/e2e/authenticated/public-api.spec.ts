import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFileSync } from "node:fs";

import { hasE2ECredentials, SKIP_REASON, STORAGE_STATE_PATH } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getWorkerProjectSlug,
  trackClientErrors,
} from "./support";

/**
 * Authenticated e2e — the public REST API v1 end to end: mint a real
 * `apiKeys` row (scoped to this worker's fixture project, production-only,
 * all three resources), then drive every new /api/v1 route through it — the
 * exact surface an integration would hit.
 *
 * No `ApiKeysSection` UI exists yet (checked apps/web/src/components/ —
 * absent), so the credential is minted directly via
 * `features/api/keys:create`, authenticated as the fixture OWNER through the
 * same saved-session → /api/auth/me → ConvexHttpClient.setAuth pattern
 * variable-requests.spec.ts uses. This is NOT a test-only shortcut around
 * the product: `create` is the real action the (not-yet-built) API Keys
 * settings UI will call, with the real create-time authorization
 * (assertOrgMembership/authorizeVariableAccess) and the real `public_api`
 * tier gate — only the click-through UI step is skipped.
 *
 * The CI/CD Tokens tab (project settings) is NOT used here: it writes to the
 * separate `serviceTokens` table (convex/features/cicd/tokens.ts), not
 * `apiKeys` — and the public API's `_authorizeRequest` enforcement core
 * (convex/features/api/authorize.ts) only ever looks up `apiKeys` by hash.
 * A serviceTokens-only credential would 401 against every /api/v1/* route
 * below (only the legacy /api/v1/secrets compat endpoint reads both tables).
 *
 * Serial: later tests reuse the token/project/variables the first test
 * creates within this worker's own fixture project.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

// Distinct prefixes so the "prefix filter" test can select ONE of the two
// seeded variables unambiguously.
const PLAIN_KEY = `E2E_PUBAPI_PLAIN_${Date.now()}`;
const PREFIXED_KEY = `E2E_PUBAPI_PFX_${Date.now()}`;
const PLAIN_VALUE = `pubapi-plain-${Date.now()}`;
const PREFIXED_VALUE = `pubapi-pfx-${Date.now()}`;

const fn = {
  createApiKey: makeFunctionReference<"action">("features/api/keys:create"),
  revokeApiKey: makeFunctionReference<"mutation">("features/api/keys:revoke"),
};

/**
 * The owner's WorkOS access token — see variable-requests.spec.ts's
 * identical helper for the full rationale (saved session cookies →
 * /api/auth/me → the same verified identity a ConvexHttpClient can present).
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
      `GET /api/auth/me failed (${res.status}) — is the saved e2e session still valid?`
    );
  }
  const me = (await res.json()) as { accessToken: string | null };
  if (!me.accessToken) {
    throw new Error("/api/auth/me returned no accessToken for the e2e owner.");
  }
  return me.accessToken;
}

test.describe.serial("Public REST API v1", () => {
  let projectSlug = "";
  let plaintextToken = "";
  let keyId = "";

  test("mint a production-only API key scoped to the fixture project", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    projectSlug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await createVariable(page, {
      key: PLAIN_KEY,
      value: PLAIN_VALUE,
      environments: ["production"],
    });
    await createVariable(page, {
      key: PREFIXED_KEY,
      value: PREFIXED_VALUE,
      environments: ["production"],
    });

    const orgsResponse = await page.request.get("/api/organizations");
    expect(orgsResponse.ok(), await orgsResponse.text()).toBeTruthy();
    const { organizations } = (await orgsResponse.json()) as {
      organizations: Array<{ _id: string; role: string }>;
    };
    const ownedOrg = organizations.find((o) => o.role === "owner");
    if (!ownedOrg) throw new Error("The e2e test user owns no organization.");

    const projectsResponse = await page.request.get(
      `/api/projects?organizationId=${ownedOrg._id}`
    );
    expect(projectsResponse.ok(), await projectsResponse.text()).toBeTruthy();
    const { projects } = (await projectsResponse.json()) as {
      projects: Array<{ _id: string; slug: string }>;
    };
    const project = projects.find((p) => p.slug === projectSlug);
    if (!project)
      throw new Error("Worker fixture project not found via /api/projects.");

    if (!CONVEX_URL) {
      throw new Error(
        "NEXT_PUBLIC_CONVEX_URL is not set — required to mint the API key."
      );
    }
    const convex = new ConvexHttpClient(CONVEX_URL);
    convex.setAuth(await fetchOwnerAccessToken());

    const minted = (await convex.action(fn.createApiKey, {
      organizationId: ownedOrg._id,
      name: `E2E Public API key ${Date.now()}`,
      scopeProjects: [project._id],
      // Production-only on purpose — the "wrong environment" test below
      // depends on development being OUT of scope.
      scopeEnvironments: ["production"],
      scopeResources: ["variables", "accounts", "projects"],
    })) as { keyId: string; token: string };

    plaintextToken = minted.token;
    keyId = minted.keyId;
    expect(plaintextToken).toMatch(/^envpk_[0-9a-f]{40}$/);

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("GET /api/v1/projects lists the scoped project", async ({ page }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const response = await page.request.get("/api/v1/projects", {
      headers: { Authorization: `Bearer ${plaintextToken}` },
    });
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as {
      projects: Array<{ slug: string; variableCount: number }>;
    };
    const scoped = body.projects.find((p) => p.slug === projectSlug);
    expect(scoped, "the scoped project should be listed").toBeTruthy();
    expect(scoped!.variableCount).toBeGreaterThanOrEqual(2);
  });

  test("GET /api/v1/organization and /api/v1/projects/{slug} respond", async ({
    page,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const orgResponse = await page.request.get("/api/v1/organization", {
      headers: { Authorization: `Bearer ${plaintextToken}` },
    });
    expect(orgResponse.status(), await orgResponse.text()).toBe(200);
    const org = (await orgResponse.json()) as { name: string; slug: string };
    expect(org.slug.length).toBeGreaterThan(0);

    const projectResponse = await page.request.get(
      `/api/v1/projects/${projectSlug}`,
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(projectResponse.status(), await projectResponse.text()).toBe(200);
    const project = (await projectResponse.json()) as { slug: string };
    expect(project.slug).toBe(projectSlug);
  });

  test("GET .../variables pulls the scoped production values", async ({
    page,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const response = await page.request.get(
      `/api/v1/projects/${projectSlug}/variables?environment=production`,
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as {
      variables: Array<{ key: string; value?: string }>;
    };
    const plain = body.variables.find((v) => v.key === PLAIN_KEY);
    const prefixed = body.variables.find((v) => v.key === PREFIXED_KEY);
    expect(plain, "the plain-key variable should be pulled").toBeTruthy();
    expect(prefixed, "the prefixed-key variable should be pulled").toBeTruthy();
    expect(plain!.value).toBe(PLAIN_VALUE);
    expect(prefixed!.value).toBe(PREFIXED_VALUE);
  });

  test("metadata_only=true omits values", async ({ page }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const response = await page.request.get(
      `/api/v1/projects/${projectSlug}/variables?metadata_only=true`,
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as {
      variables: Array<{ key: string; value?: string; isSensitive: boolean }>;
    };
    const plain = body.variables.find((v) => v.key === PLAIN_KEY);
    expect(plain, "the variable should still be listed").toBeTruthy();
    expect(
      plain!.value,
      "metadata_only must never include a value"
    ).toBeUndefined();
  });

  test("prefix filter narrows to the matching variable only", async ({
    page,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const response = await page.request.get(
      `/api/v1/projects/${projectSlug}/variables?environment=production&prefix=E2E_PUBAPI_PFX_`,
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as {
      variables: Array<{ key: string }>;
    };
    expect(body.variables.some((v) => v.key === PREFIXED_KEY)).toBe(true);
    expect(body.variables.some((v) => v.key === PLAIN_KEY)).toBe(false);
  });

  test("format=env returns a dotenv text body", async ({ page }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const response = await page.request.get(
      `/api/v1/projects/${projectSlug}/variables?environment=production&format=env`,
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(response.status(), await response.text()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    const text = await response.text();
    expect(text).toContain(`${PLAIN_KEY}='${PLAIN_VALUE}'`);
    expect(text).toContain(`${PREFIXED_KEY}='${PREFIXED_VALUE}'`);
  });

  test("an out-of-scope environment is rejected with 403", async ({ page }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const response = await page.request.get(
      `/api/v1/projects/${projectSlug}/variables?environment=development`,
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(response.status(), await response.text()).toBe(403);
  });

  test("an unknown project slug 404s (never 403)", async ({ page }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const response = await page.request.get(
      `/api/v1/projects/does-not-exist-${Date.now()}/variables?environment=production`,
      { headers: { Authorization: `Bearer ${plaintextToken}` } }
    );
    expect(response.status(), await response.text()).toBe(404);
  });

  test("a bad or missing key is rejected with 401", async ({ page }) => {
    const badKey = await page.request.get(
      `/api/v1/projects/${projectSlug || "any"}/variables?environment=production`,
      { headers: { Authorization: `Bearer envpk_${"0".repeat(40)}` } }
    );
    expect(badKey.status(), "unknown key must 401").toBe(401);

    const noKey = await page.request.get(
      `/api/v1/projects/${projectSlug || "any"}/variables?environment=production`
    );
    expect(noKey.status(), "missing bearer must 401").toBe(401);

    const noKeyProjects = await page.request.get("/api/v1/projects");
    expect(noKeyProjects.status(), "missing bearer must 401").toBe(401);
  });

  test("cleanup: revoke the key and remove test variables", async ({
    page,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    if (keyId && CONVEX_URL) {
      const convex = new ConvexHttpClient(CONVEX_URL);
      convex.setAuth(await fetchOwnerAccessToken());
      await convex.mutation(fn.revokeApiKey, { keyId });

      const afterRevoke = await page.request.get(
        `/api/v1/projects/${projectSlug}/variables?environment=production`,
        { headers: { Authorization: `Bearer ${plaintextToken}` } }
      );
      expect(afterRevoke.status(), "revoked key must 401").toBe(401);
    }

    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await deleteVariableByKey(page, PLAIN_KEY);
    await deleteVariableByKey(page, PREFIXED_KEY);
  });
});
