import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  authenticateAccessTokenRequest,
  unauthorizedResponse,
  forbiddenResponse,
  tierLimitResponse,
} from "@/lib/access-token-auth";
import { readSecret } from "@/lib/vault";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/token/variables
 *
 * Fetch environment variables using a CI/CD access token (ep_at_*).
 * Unlike /api/cli/variables, this endpoint:
 *   - Uses access tokens (not CLI session tokens)
 *   - Enforces token-level project and environment scoping
 *   - Does NOT require org membership beyond the token's authorization
 */
export async function GET(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const auth = await authenticateAccessTokenRequest(request, convex);

  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  const {
    organizationId,
    projectIds: allowedProjectIds,
    environments: allowedEnvironments,
  } = auth;

  // ── Parse query params ────────────────────────────────────────────────────
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const environment = url.searchParams.get("environment");

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing projectId parameter" },
      { status: 400 }
    );
  }

  if (!environment) {
    return NextResponse.json(
      { error: "Missing environment parameter" },
      { status: 400 }
    );
  }

  try {
    // ── Project scope check ───────────────────────────────────────────────
    // If token has specific projects listed, the requested project must be one of them.
    // If projectIds is empty, the token has access to all org projects.
    if (
      allowedProjectIds.length > 0 &&
      !allowedProjectIds.includes(projectId as Id<"projects">)
    ) {
      return forbiddenResponse(
        "This access token does not have permission to access this project."
      );
    }

    // ── Environment scope check ───────────────────────────────────────────
    // Same pattern: empty environments = all environments allowed.
    if (
      allowedEnvironments.length > 0 &&
      !allowedEnvironments.includes(environment)
    ) {
      return forbiddenResponse(
        `This access token is restricted to: ${allowedEnvironments.join(", ")}. Requested environment "${environment}" is not allowed.`
      );
    }

    // ── Parallel Convex lookups ───────────────────────────────────────────
    // All three queries are independent — fire them together to halve latency.
    const [project, featureCheck, convexUser] = await Promise.all([
      convex.query(api.projects.getById, {
        projectId: projectId as Id<"projects">,
      }),
      convex.query(api.featureRegistry.checkFeature, {
        organizationId,
        featureKey: "access_tokens",
      }),
      convex.query(api.users.getByWorkosId, {
        workosId: auth.userId,
      }),
    ]);

    // ── Validate results ──────────────────────────────────────────────────
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.organizationId !== organizationId) {
      return forbiddenResponse(
        "This project does not belong to the organization this token was issued for."
      );
    }

    if (!featureCheck.allowed) {
      return tierLimitResponse(
        "CI/CD Access Tokens are a Pro feature. Upgrade to use this endpoint."
      );
    }

    if (!convexUser) {
      return unauthorizedResponse("User account not found");
    }

    const variables = await convex.query(api.variables.listWithAccess, {
      projectId: projectId as Id<"projects">,
      userId: convexUser._id,
    });

    const accessible = variables
      .filter((v) => v.hasAccess)
      .filter((v) => v.environments.includes(environment));

    // ── Decrypt values ────────────────────────────────────────────────────
    const settled = await Promise.allSettled(
      accessible.map(async (variable) => {
        const value = await readSecret(variable.vaultRef);
        return {
          _id: variable._id,
          key: variable.key,
          value: value || "",
          environment,
          description: variable.description,
          isSensitive: variable.isSensitive,
          version: variable.version,
          createdAt: variable.createdAt,
          updatedAt: variable.updatedAt,
        };
      })
    );

    const variablesWithValues: Array<{
      _id: string;
      key: string;
      value: string;
      environment: string;
      description?: string;
      isSensitive?: boolean;
      version?: number;
      createdAt?: number;
      updatedAt?: number;
    }> = [];
    const decryptionFailures: string[] = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === "fulfilled") {
        variablesWithValues.push(result.value);
      } else {
        const variable = accessible[i];
        console.error(
          `[Token Variables] Vault decryption failed for key "${variable.key}" (${variable._id}):`,
          result.reason
        );
        decryptionFailures.push(variable.key);
      }
    }

    return NextResponse.json({
      success: true,
      data: variablesWithValues,
      meta: {
        total: variablesWithValues.length,
        environment,
        decryptionFailures:
          decryptionFailures.length > 0 ? decryptionFailures : undefined,
      },
    });
  } catch (error) {
    console.error("[Token Variables] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch variables" },
      { status: 500 }
    );
  }
}
