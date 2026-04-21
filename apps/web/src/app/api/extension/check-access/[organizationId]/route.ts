import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { checkOrganizationMembership } from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";

interface RouteParams {
  params: Promise<{
    organizationId: string;
  }>;
}

/**
 * GET /api/extension/check-access/[organizationId] - Check if extension access is enabled
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateExtensionRequest(request);

    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { organizationId } = await params;

    const convexUser = auth.convexUser;

    // Check membership
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId as Id<"organizations">
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check extension_access via dynamic feature registry
    const extCheck = await convex.query(api.featureRegistry.checkFeature, {
      organizationId: organizationId as Id<"organizations">,
      featureKey: "extension_access",
    });

    return NextResponse.json({
      data: {
        enabled: extCheck.allowed,
        tier: extCheck.tierName,
        reason: extCheck.allowed
          ? undefined
          : "VS Code extension access is not available on your current tier.",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check access";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
