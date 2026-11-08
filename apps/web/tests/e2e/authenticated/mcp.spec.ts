import { expect, test } from "@playwright/test";

/**
 * e2e: the remote MCP server (/api/mcp) accepts OAuth sign-in only.
 *
 * What a client sees before it signs in is automated here: the 401 that
 * starts sign-in, the refusal of an old `envpk_` API key, and the protected
 * resource metadata that names the sign-in server. The sign-in itself is a
 * WorkOS AuthKit browser flow, checked by hand with Claude Code (`/mcp` ->
 * Authenticate) against a deployment that has MCP_OAUTH_* configured.
 */

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
const TOOLS_LIST = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

test.describe("MCP server (/api/mcp)", () => {
  test("a call without a token gets the sign-in challenge", async ({
    request,
  }) => {
    const response = await request.post("/api/mcp", {
      headers: MCP_HEADERS,
      data: TOOLS_LIST,
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"] ?? "").toContain(
      "resource_metadata="
    );
  });

  test("an old API key is refused like a missing token", async ({
    request,
  }) => {
    const response = await request.post("/api/mcp", {
      headers: {
        ...MCP_HEADERS,
        Authorization: `Bearer envpk_${"0".repeat(40)}`,
      },
      data: TOOLS_LIST,
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"] ?? "").toContain(
      "resource_metadata="
    );
  });

  test("the metadata names this server and its sign-in service", async ({
    request,
  }) => {
    const response = await request.get(
      "/.well-known/oauth-protected-resource/api/mcp"
    );
    // 503 is the current answer when the OAuth variables are missing; 404
    // was the old one, and a deployment can still be running it.
    test.skip(
      response.status() === 503 || response.status() === 404,
      "MCP_OAUTH_ISSUER / MCP_OAUTH_RESOURCE are not set on this deployment"
    );
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      resource?: string;
      authorization_servers?: string[];
    };
    expect(body.resource ?? "").toMatch(/\/api\/mcp$/);
    expect(body.authorization_servers?.length ?? 0).toBeGreaterThan(0);
  });
});
