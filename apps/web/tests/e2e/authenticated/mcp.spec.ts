import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFileSync } from "node:fs";

import { hasE2ECredentials, SKIP_REASON, STORAGE_STATE_PATH } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getWorkerProjectSlug,
  parseMcpBody,
  postMcp,
  trackClientErrors,
} from "./support";

/**
 * Authenticated e2e — the remote MCP server (/api/mcp) end to end: mint a
 * real `apiKeys` row exactly like public-api.spec.ts, then drive the raw
 * JSON-RPC Streamable HTTP handshake (`initialize` -> `tools/list` ->
 * `tools/call`) through it via `page.request`, the same transport a real MCP
 * client (Claude, Cursor, Claude Code) speaks.
 *
 * mcp-research.md confirms the Streamable HTTP POST endpoint requires:
 *   - `Content-Type: application/json`
 *   - `Accept: application/json, text/event-stream` (BOTH values, or the
 *     transport 406s)
 * and — because mcp-handler 1.1.0 / SDK 1.29.0 does not expose
 * `enableJsonResponse`, every successful response body is SSE-framed
 * (`Content-Type: text/event-stream`, one `data: {...}` event) even for a
 * single non-streaming JSON-RPC call. `postMcp` below POSTs the handshake
 * and unwraps that SSE framing (or falls back to plain JSON) so assertions
 * can just read the parsed JSON-RPC envelope. The server runs stateless
 * (no sessionIdGenerator), so no `Mcp-Session-Id`/`Mcp-Protocol-Version`
 * headers are required on follow-up calls.
 *
 * Serial: later tests reuse the token/project/variable the first test mints.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

const fn = {
  createApiKey: makeFunctionReference<"action">("features/api/keys:create"),
  revokeApiKey: makeFunctionReference<"mutation">("features/api/keys:revoke"),
};

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

const VAR_KEY = `E2E_MCP_VAR_${Date.now()}`;
const VAR_VALUE = `mcp-value-${Date.now()}`;

/** Same rationale as public-api.spec.ts's identical helper. */
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

test.describe.serial("MCP server (/api/mcp)", () => {
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
      key: VAR_KEY,
      value: VAR_VALUE,
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
      name: `E2E MCP key ${Date.now()}`,
      scopeProjects: [project._id],
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

  test("initialize returns server info", async ({ request }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const { status, json } = await postMcp(request, plaintextToken, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "envpilot-e2e", version: "1.0.0" },
      },
    });

    expect(status, JSON.stringify(json)).toBe(200);
    expect(json?.error).toBeUndefined();
    const result = json?.result as {
      serverInfo?: { name?: string; version?: string };
    };
    expect(result?.serverInfo?.name).toBe("envpilot");
    expect(result?.serverInfo?.version?.length ?? 0).toBeGreaterThan(0);
  });

  test("tools/list returns exactly the 7 documented tools", async ({
    request,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const { status, json } = await postMcp(request, plaintextToken, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    expect(status, JSON.stringify(json)).toBe(200);
    const result = json?.result as { tools?: Array<{ name: string }> };
    const names = (result?.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "envpilot_get_request_status",
        "envpilot_get_variable",
        "envpilot_get_variables",
        "envpilot_list_accounts",
        "envpilot_list_projects",
        "envpilot_request_variable",
        "envpilot_search",
      ].sort()
    );
  });

  test("tools/call envpilot_get_variables returns the created variable", async ({
    request,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const { status, json } = await postMcp(request, plaintextToken, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "envpilot_get_variables",
        arguments: { project: projectSlug, environment: "production" },
      },
    });

    expect(status, JSON.stringify(json)).toBe(200);
    const result = json?.result as {
      isError?: boolean;
      structuredContent?: {
        variables: Array<{ key: string; value?: string }>;
      };
    };
    expect(result?.isError, JSON.stringify(result)).toBeFalsy();
    const variable = result?.structuredContent?.variables.find(
      (v) => v.key === VAR_KEY
    );
    expect(variable, "the created variable should be returned").toBeTruthy();
    expect(variable!.value).toBe(VAR_VALUE);
  });

  test("tools/call envpilot_get_variable fetches a single key", async ({
    request,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const { status, json } = await postMcp(request, plaintextToken, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "envpilot_get_variable",
        arguments: {
          project: projectSlug,
          environment: "production",
          key: VAR_KEY,
        },
      },
    });

    expect(status, JSON.stringify(json)).toBe(200);
    const result = json?.result as {
      isError?: boolean;
      structuredContent?: { variable: { key: string; value?: string } | null };
    };
    expect(result?.isError, JSON.stringify(result)).toBeFalsy();
    expect(result?.structuredContent?.variable?.value).toBe(VAR_VALUE);
  });

  test("tools/call envpilot_list_projects lists the scoped project", async ({
    request,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const { status, json } = await postMcp(request, plaintextToken, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "envpilot_list_projects", arguments: {} },
    });

    expect(status, JSON.stringify(json)).toBe(200);
    const result = json?.result as {
      isError?: boolean;
      structuredContent?: { projects: Array<{ slug: string }> };
    };
    expect(result?.isError, JSON.stringify(result)).toBeFalsy();
    expect(
      result?.structuredContent?.projects.some((p) => p.slug === projectSlug)
    ).toBe(true);
  });

  test("tools/call envpilot_search finds the created variable by key substring", async ({
    request,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const { status, json } = await postMcp(request, plaintextToken, {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "envpilot_search",
        // A substring unique to this run's variable key (not the whole
        // VAR_KEY, to also exercise substring matching).
        arguments: { query: VAR_KEY.slice(0, -6) },
      },
    });

    expect(status, JSON.stringify(json)).toBe(200);
    const result = json?.result as {
      isError?: boolean;
      structuredContent?: {
        results: Array<{
          projectSlug: string;
          matchType: string;
          key?: string;
        }>;
      };
    };
    expect(result?.isError, JSON.stringify(result)).toBeFalsy();
    const match = result?.structuredContent?.results.find(
      (r) => r.matchType === "variable" && r.key === VAR_KEY
    );
    expect(match?.projectSlug).toBe(projectSlug);
  });

  test("tools/call envpilot_list_accounts is wired to the scoped project", async ({
    request,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const { status, json } = await postMcp(request, plaintextToken, {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "envpilot_list_accounts",
        arguments: { project: projectSlug },
      },
    });

    expect(status, JSON.stringify(json)).toBe(200);
    const result = json?.result as {
      isError?: boolean;
      structuredContent?: { accounts: unknown[] };
    };
    // The fixture project has no shared accounts seeded — this asserts the
    // tool reaches the real Convex action and returns a well-formed (empty)
    // result rather than an error, not that accounts exist.
    expect(result?.isError, JSON.stringify(result)).toBeFalsy();
    expect(Array.isArray(result?.structuredContent?.accounts)).toBe(true);
  });

  test("an out-of-scope environment surfaces as an MCP tool error", async ({
    request,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    const { status, json } = await postMcp(request, plaintextToken, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "envpilot_get_variables",
        arguments: { project: projectSlug, environment: "development" },
      },
    });

    expect(status, JSON.stringify(json)).toBe(200);
    const result = json?.result as {
      isError?: boolean;
      content?: Array<{ type: string; text: string }>;
    };
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text ?? "").toMatch(/not in this api key/i);
  });

  test("a bad bearer token is rejected before the JSON-RPC layer", async ({
    request,
  }) => {
    const badToken = `envpk_${"0".repeat(40)}`;
    const response = await request.post("/api/mcp", {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${badToken}`,
      },
      data: {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "envpilot_list_projects", arguments: {} },
      },
    });
    // withMcpAuth's shape check accepts any envpk_-prefixed string at the
    // transport layer (real validation is per-Convex-call) — so this
    // request DOES reach the tool handler, and the invalid key surfaces as
    // an MCP tool error (isError: true) from `_authorizeRequest`'s denial,
    // exactly like the REST surface. `tools/list` itself never touches
    // Convex (no token check), so the bad-token assertion must be a
    // `tools/call`. A malformed (non-envpk_) token is what gets rejected at
    // the transport layer with a bare 401 below.
    expect(response.status()).toBe(200);
    const contentType = response.headers()["content-type"] ?? "";
    const parsed = parseMcpBody(contentType, await response.text());
    const result = parsed.result as {
      isError?: boolean;
      content?: Array<{ type: string; text: string }>;
    };
    expect(result?.isError).toBe(true);
    expect(result?.content?.[0]?.text ?? "").toMatch(/invalid or revoked/i);

    const noAuthResponse = await request.post("/api/mcp", {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 8, method: "tools/list", params: {} },
    });
    expect(noAuthResponse.status(), "missing bearer must 401").toBe(401);

    const malformedResponse = await request.post("/api/mcp", {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer not-an-envpk-token",
      },
      data: { jsonrpc: "2.0", id: 9, method: "tools/list", params: {} },
    });
    expect(
      malformedResponse.status(),
      "a non-envpk_-shaped bearer must 401 at the transport layer"
    ).toBe(401);
  });

  test("cleanup: revoke the key and remove the test variable", async ({
    page,
  }) => {
    test.skip(!plaintextToken, "no key from the mint test");

    if (keyId && CONVEX_URL) {
      const convex = new ConvexHttpClient(CONVEX_URL);
      convex.setAuth(await fetchOwnerAccessToken());
      await convex.mutation(fn.revokeApiKey, { keyId });
    }

    await page.goto(`/dashboard/projects/${projectSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await deleteVariableByKey(page, VAR_KEY);
  });
});
