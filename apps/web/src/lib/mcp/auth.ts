import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { mcpTokenConfig, verifyMcpAccessToken } from "@convex/lib/mcpToken";

export type McpPrincipal = { kind: "key" | "oauth"; token: string };

export const MCP_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource/api/mcp";

export function mcpOAuthConfig() {
  return mcpTokenConfig(process.env);
}

export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  if (bearerToken.startsWith("envpk_")) {
    return {
      token: bearerToken,
      clientId: "envpilot-mcp",
      scopes: [],
      extra: { kind: "key" },
    };
  }

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
    extra: { kind: "oauth" },
  };
}

export function principalKind(
  authInfo: AuthInfo | undefined
): McpPrincipal["kind"] {
  return authInfo?.extra?.kind === "oauth" ? "oauth" : "key";
}
