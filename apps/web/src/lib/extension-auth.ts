import { withAuth } from "@workos-inc/authkit-nextjs";
import { convex } from "@/lib/convex-client";
import type { Doc } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "./convex-helpers";
import { createLogger } from "./logger";

const log = createLogger("lib/extension-auth");

interface ExtensionAuthResult {
  convexUser: Doc<"users">;
}

/**
 * Authenticate a browser-originated extension API request via the WorkOS
 * session cookie.
 *
 * Since the Stage 2 device-flow cutover the old homegrown bearer branch
 * (cliTokens/cliSessions) is gone: the extension attaches a real WorkOS JWT and
 * either calls Convex directly (setAuth) or, for the surviving vault route, is
 * verified with `verifyWorkosBearer` from lib/cli-auth. This helper only covers
 * the session-cookie path used by browser-based calls.
 *
 * Returns the authenticated Convex user, or null if not authenticated.
 */
export async function authenticateExtensionRequest(): Promise<ExtensionAuthResult | null> {
  // Wrapped in try-catch because withAuth() throws if AuthKit middleware
  // is not active on this route.
  try {
    const { user } = await withAuth();
    if (!user) {
      return null;
    }

    const convexUser = await getOrCreateConvexUser(convex, user);
    return { convexUser };
  } catch (error) {
    log.warn("session_auth_unavailable", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
