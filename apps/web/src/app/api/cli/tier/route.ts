import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
  checkCLIAccess,
  tierLimitResponse,
  extractBearerToken,
} from "@/lib/cli-auth";
import { cacheHeaders } from "@/lib/cache-headers";
import { reportApiError } from "@/lib/api-errors";

/**
 * GET /api/cli/tier
 * Get tier information for an organization
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { error: "Missing organizationId parameter" },
      { status: 400 }
    );
  }

  try {
    const token = extractBearerToken(request)!;

    // Check membership
    const membership = await convex.query(
      api.organizations.getMembershipForToken,
      {
        accessToken: token,
        organizationId: organizationId as Id<"organizations">,
      }
    );

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    // Check CLI access feature gate
    const cliAccess = await checkCLIAccess(
      convex,
      organizationId as Id<"organizations">
    );
    if (!cliAccess.allowed) {
      return tierLimitResponse(
        cliAccess.reason ?? "CLI access is not available on your current tier."
      );
    }

    // Get organization
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<"organizations">,
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const enforcementEnabled = await convex.query(
      api.tierLimits.isEnforcementEnabled,
      {}
    );

    const resolvedFeatures = await convex.query(
      api.featureRegistry.getResolvedFeatures,
      {
        organizationId: organizationId as Id<"organizations">,
      }
    );

    return NextResponse.json(
      {
        tier: resolvedFeatures?.tierName ?? "free",
        enforcementEnabled,
        // Legacy format for older CLI versions
        apiAccessEnabled: resolvedFeatures?.features?.api_access?.value ?? true,
        limits: {
          projects: resolvedFeatures?.features?.max_projects?.value ?? null,
          variablesPerProject:
            resolvedFeatures?.features?.max_variables_per_project?.value ??
            null,
          teamMembers:
            resolvedFeatures?.features?.max_team_members?.value ?? null,
        },
        features: {
          versionHistory:
            resolvedFeatures?.features?.variable_version_history?.value ??
            false,
          bulkImport: resolvedFeatures?.features?.bulk_import?.value ?? false,
          extensionAccess:
            resolvedFeatures?.features?.extension_access?.value ?? true,
          granularPermissions:
            resolvedFeatures?.features?.granular_permissions?.value ?? false,
          auditLogRetentionDays:
            resolvedFeatures?.features?.audit_log_retention_days?.value ?? 7,
        },
        // New dynamic format
        resolvedFeatures: resolvedFeatures?.features ?? {},
      },
      { headers: cacheHeaders.privateMedium }
    );
  } catch (error) {
    reportApiError(error, "GET /api/cli/tier");
    console.error("CLI tier error:", error);
    return NextResponse.json(
      { error: "Failed to get tier information" },
      { status: 500 }
    );
  }
}
