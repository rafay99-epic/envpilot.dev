import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/cli-auth";
import { getTierLimits, isTierEnforcementEnabled } from "@/lib/tier-limits";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/cli/usage
 * Get tier limits and current usage for an organization
 */
export async function GET(request: NextRequest) {
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
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: organizationId as Id<"organizations">,
      userId: authResult.userId,
    });

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    const usageData = await convex.query(
      api.tierLimits.getOrganizationUsage,
      { organizationId: organizationId as Id<"organizations"> }
    );

    const enforcementEnabled = isTierEnforcementEnabled();
    const limits = getTierLimits(usageData.tier);

    return NextResponse.json({
      tier: usageData.tier,
      enforcementEnabled,
      limits: {
        projects: limits.maxProjects,
        variablesPerProject: limits.maxVariablesPerProject,
        teamMembers: limits.maxTeamMembers,
      },
      usage: usageData.usage,
      features: {
        versionHistory: limits.variableVersionHistoryEnabled,
        bulkImport: limits.bulkImportEnabled,
        extensionAccess: limits.extensionAccessEnabled,
        granularPermissions: limits.granularPermissionsEnabled,
        auditLogRetentionDays: limits.auditLogRetentionDays,
      },
    });
  } catch (error) {
    console.error("CLI usage error:", error);
    return NextResponse.json(
      { error: "Failed to get usage information" },
      { status: 500 }
    );
  }
}
