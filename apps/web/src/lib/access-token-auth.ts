import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { NextRequest } from "next/server";

// Re-export these from cli-auth for convenience
export {
  extractBearerToken,
  unauthorizedResponse,
  forbiddenResponse,
  tierLimitResponse,
} from "./cli-auth";

export interface AccessTokenAuthResult {
  valid: true;
  userId: string; // WorkOS user ID (string, not Convex ID)
  tokenId: Id<"accessTokens">;
  organizationId: Id<"organizations">;
  projectIds: Id<"projects">[]; // empty = all org projects
  environments: string[]; // empty = all environments
}

type AccessTokenAuthFailure = { valid: false; error: string };

export type AccessTokenAuth = AccessTokenAuthResult | AccessTokenAuthFailure;

export async function authenticateAccessTokenRequest(
  request: NextRequest,
  convex: ConvexHttpClient
): Promise<AccessTokenAuth> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing authorization header" };
  }
  const token = authHeader.slice(7);

  if (!token.startsWith("ep_at_")) {
    return { valid: false, error: "Invalid token format" };
  }

  try {
    const result = await convex.query(api.accessTokens.validateAccessToken, {
      token,
    });

    if (!result.valid) {
      return { valid: false, error: result.error };
    }

    // Fire-and-forget last-used update
    convex
      .mutation(api.accessTokens.updateLastUsed, { tokenId: result.tokenId })
      .catch(() => {});

    return {
      valid: true,
      userId: result.userId,
      tokenId: result.tokenId,
      organizationId: result.organizationId,
      projectIds: result.projectIds,
      environments: result.environments,
    };
  } catch {
    return { valid: false, error: "Failed to validate token" };
  }
}
