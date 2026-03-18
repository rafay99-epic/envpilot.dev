import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { checkOrganizationMembership } from "@/lib/convex-helpers";
import { getTierLimits } from "@/lib/tier-limits";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/extension/usage
 * Get tier limits and current usage for an organization
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateExtensionRequest(request);

    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organizationId parameter" },
        { status: 400 }
      );
    }

    const membership = await checkOrganizationMembership(
      convex,
      auth.convexUser._id,
      organizationId as Id<"organizations">
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const usageData = await convex.query(api.tierLimits.getOrganizationUsage, {
      organizationId: organizationId as Id<"organizations">,
    });

    if (!usageData) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const enforcementEnabled = await convex.query(
      api.tierLimits.isEnforcementEnabled,
      {}
    );
    const limits = getTierLimits(usageData.tier);

    return NextResponse.json({
      data: {
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
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to get usage information";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
