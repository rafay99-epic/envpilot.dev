import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
  extractBearerToken,
} from "@/lib/cli-auth";
import { reportApiError } from "@/lib/api-errors";

/**
 * GET /api/cli/variables/fingerprint
 *
 * Returns a short hash of the variable metadata (id + version + updatedAt)
 * for the given project/environment WITHOUT decrypting any vault secrets.
 *
 * The CLI uses this to decide whether the full /api/cli/variables fetch is
 * necessary. If the fingerprint matches the cached one, the CLI extends its
 * local cache TTL without touching the vault — eliminating the expensive
 * vault decryption calls on every stale-cache check.
 *
 * Cost profile vs. full /api/cli/variables:
 *   - Same auth + Convex query (listWithAccess)
 *   - Zero WorkOS Vault calls (no readSecret)
 *   - Tiny response payload (~40 bytes)
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const environment = url.searchParams.get("environment");

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing projectId parameter" },
      { status: 400 }
    );
  }

  // environment is required: the fingerprint must be scoped to the same
  // environment as the cache entry, otherwise the hashes are always different
  // and every stale check triggers an unnecessary full fetch.
  if (!environment) {
    return NextResponse.json(
      { error: "Missing environment parameter" },
      { status: 400 }
    );
  }

  try {
    // Verify project exists
    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify organization membership
    const token = extractBearerToken(request)!;
    const membership = await convex.query(
      api.organizations.getMembershipForToken,
      {
        accessToken: token,
        organizationId: project.organizationId,
      }
    );

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    // Fetch variable metadata — same access rules as the full endpoint,
    // but we never call readSecret() so vault is untouched.
    const variables = await convex.query(api.variables.listWithAccess, {
      projectId: projectId as Id<"projects">,
      userId: authResult.userId,
    });

    const accessible = variables
      .filter((v) => v.hasAccess)
      .filter((v) => v.environments.includes(environment));

    // Fingerprint: sorted hash of id:version:updatedAt
    // Changes whenever a variable is added, removed, renamed, or its value
    // is updated (which bumps both version and updatedAt in Convex).
    const fingerprint = createHash("sha256")
      .update(
        accessible
          .map((v) => `${v._id}:${v.version}:${v.updatedAt}`)
          .sort()
          .join("|")
      )
      .digest("hex")
      .slice(0, 16);

    return NextResponse.json({ fingerprint });
  } catch (error) {
    reportApiError(error, "GET /api/cli/variables/fingerprint");
    console.error("CLI variables fingerprint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
