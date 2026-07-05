import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { checkOrganizationMembershipForToken } from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { reportApiError } from "@/lib/api-errors";

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

    // Check membership — identity re-derived server-side from the bearer token.
    const membership = await checkOrganizationMembershipForToken(
      convex,
      auth.accessToken!,
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
    reportApiError(error, "GET /api/extension/check-access/[organizationId]");
    const message =
      error instanceof Error ? error.message : "Failed to check access";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
