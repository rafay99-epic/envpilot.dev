import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type McpTokenConfig = { issuer: string; resource: string };

export type McpTokenClaims = {
  workosId: string;
  clientId?: string;
  expiresAt?: number;
};

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function stringClaim(payload: JWTPayload, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" ? value : undefined;
}

export function mcpTokenConfig(
  env: Record<string, string | undefined>
): McpTokenConfig | null {
  const issuer = env.MCP_OAUTH_ISSUER;
  const resource = env.MCP_OAUTH_RESOURCE;
  return issuer && resource ? { issuer, resource } : null;
}

export async function verifyMcpAccessToken(
  token: string,
  config: McpTokenConfig
): Promise<McpTokenClaims | null> {
  let keySet = keySets.get(config.issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL("/oauth2/jwks", config.issuer));
    keySets.set(config.issuer, keySet);
  }
  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: config.issuer,
      audience: config.resource,
      algorithms: ["RS256"],
    });
    if (!payload.sub) return null;
    return {
      workosId: payload.sub,
      clientId:
        stringClaim(payload, "client_id") ?? stringClaim(payload, "azp"),
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
