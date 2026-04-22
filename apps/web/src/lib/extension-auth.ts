import { withAuth } from "@workos-inc/authkit-nextjs";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "./convex-helpers";
import { createLogger, tokenPrefix } from "./logger";

const log = createLogger("lib/extension-auth");

interface ExtensionAuthResult {
  convexUser: Doc<"users">;
}

/**
 * Authenticate an extension API request.
 *
 * Tries two methods in order:
 * 1. Bearer token from Authorization header → validated against cliTokens table
 * 2. WorkOS session cookie via withAuth() → for browser-based calls (requires middleware)
 *
 * Returns the authenticated Convex user, or null if not authenticated.
 */
export async function authenticateExtensionRequest(
  request: Request
): Promise<ExtensionAuthResult | null> {
  // Method 1: Bearer token (sent by the extension/CLI)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return authenticateByToken(token);
  }

  // Method 2: Session cookie (browser-based calls)
  // Wrapped in try-catch because withAuth() throws if AuthKit middleware
  // is not active on this route (e.g. extension API routes)
  try {
    return await authenticateBySession();
  } catch (error) {
    log.warn("session_auth_unavailable", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

async function authenticateByToken(
  token: string
): Promise<ExtensionAuthResult | null> {
  try {
    const validation = await convex.query(api.cliSessions.validateToken, {
      accessToken: token,
    });

    if (!validation.valid || !validation.userId) {
      return null;
    }

    const user = await convex.query(api.users.getById, {
      userId: validation.userId,
    });

    if (!user) {
      return null;
    }

    return { convexUser: user };
  } catch (error) {
    log.error("token_auth_failed", { token: tokenPrefix(token) }, error);
    return null;
  }
}

async function authenticateBySession(): Promise<ExtensionAuthResult | null> {
  const { user } = await withAuth();
  if (!user) {
    return null;
  }

  const convexUser = await getOrCreateConvexUser(convex, user);
  return { convexUser };
}
