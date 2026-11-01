import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { mcpTokenConfig, verifyMcpAccessToken } from "@convex/lib/mcpToken";

export const MCP_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource/api/mcp";

export function mcpOAuthConfig() {
  return mcpTokenConfig(process.env);
}

/**
 * The MCP server accepts WorkOS AuthKit access tokens only. Anything else,
 * an old `envpk_` API key included, gets undefined, which `withMcpAuth`
 * answers with a 401 that points the client at sign-in. Convex verifies the
 * token again before reading anything.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const config = mcpOAuthConfig();
  const claims = config
    ? await verifyMcpAccessToken(bearerToken, config)
    : null;
  if (!claims) return undefined;
  return {
    token: bearerToken,
    clientId: claims.clientId ?? "oauth",
    scopes: [],
    expiresAt: claims.expiresAt,
  };
}
