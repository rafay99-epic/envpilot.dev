import { withAuth } from "@workos-inc/authkit-nextjs";
import type { ConvexHttpClient } from "convex/browser";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";

/**
 * Authenticate either a browser cookie session or a WorkOS JWT bearer used by
 * the CLI/extension. API keys (`envpk_…`) are deliberately rejected here and
 * use the separately scoped /api/v1/artifacts endpoint.
 */
export async function getArtifactClient(
  request: Request
): Promise<ConvexHttpClient | null> {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (!token || token.startsWith("envpk_")) return null;
    return createAuthedConvexClient(token);
  }

  const { user, accessToken } = await withAuth();
  if (!user || !accessToken) return null;
  await getOrCreateConvexUser(convex, user);
  return createAuthedConvexClient(accessToken);
}
