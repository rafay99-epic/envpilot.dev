import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  getUserOrganizations,
} from "@/lib/cli-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/cli/organizations
 * List organizations for the authenticated user
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  try {
    const organizations = await getUserOrganizations(convex, authResult.userId);

    return NextResponse.json({
      success: true,
      data: organizations.map((org) => ({
        _id: org._id,
        name: org.name,
        slug: org.slug,
        tier: org.tier,
        role: org.role,
        description: org.description,
        logoUrl: org.logoUrl,
      })),
    });
  } catch (error) {
    console.error("CLI organizations error:", error);
    return NextResponse.json(
      { error: "Failed to list organizations" },
      { status: 500 }
    );
  }
}
