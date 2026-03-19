import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { checkOrganizationMembership } from "@/lib/convex-helpers";
import { checkExtensionAccess } from "@/lib/cli-auth";

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

    // Check extension access feature gate
    const extAccess = await checkExtensionAccess(
      convex,
      organizationId as Id<"organizations">
    );
    if (!extAccess.allowed) {
      return NextResponse.json(
        {
          error:
            extAccess.reason ??
            "Extension access is not available on your current tier.",
          code: "PAYMENT_REQUIRED",
        },
        { status: 402 }
      );
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

    const resolvedFeatures = await convex.query(
      api.featureRegistry.getResolvedFeatures,
      {
        organizationId: organizationId as Id<"organizations">,
      }
    );

    return NextResponse.json({
      data: {
        tier: resolvedFeatures?.tierName ?? usageData.tier,
        enforcementEnabled,
        // Legacy format for older extension versions
        limits: {
          projects: resolvedFeatures?.features?.max_projects?.value ?? null,
          variablesPerProject:
            resolvedFeatures?.features?.max_variables_per_project?.value ??
            null,
          teamMembers:
            resolvedFeatures?.features?.max_team_members?.value ?? null,
        },
        usage: usageData.usage,
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
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to get usage information";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
