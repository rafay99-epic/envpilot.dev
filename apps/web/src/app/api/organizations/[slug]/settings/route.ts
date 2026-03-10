import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { resolveOrgBySlug } from "@/lib/org-slug-resolver";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const updateSettingsSchema = z.object({
  settings: z.object({
    teamLeadsCanCreateProjects: z.boolean(),
  }),
});

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * PATCH /api/organizations/[slug]/settings - Update organization settings
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    const { slug } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolved = await resolveOrgBySlug(convex, slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;

    const body = await request.json();
    const validation = updateSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    await convex.mutation(api.organizations.updateSettings, {
      organizationId,
      settings: validation.data.settings,
      updatedBy: convexUser._id,
    });

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("Error updating organization settings:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
