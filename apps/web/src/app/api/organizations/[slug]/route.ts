import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { resolveOrgBySlug } from "@/lib/org-slug-resolver";
import { handleApiError } from "@/lib/api-errors";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
});

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * GET /api/organizations/[slug] - Get a single organization
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug } = await params;
    const resolved = await resolveOrgBySlug(convex, slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check membership
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      organization: { ...organization, role: membership.role },
    });
  } catch (error) {
    console.error("Error fetching organization:", error);
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/organizations/[slug] - Update an organization
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug } = await params;
    const resolved = await resolveOrgBySlug(convex, slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;

    const body = await request.json();
    const validation = updateOrgSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Authorization is enforced in the Convex mutation (assertOrgAction)
    const { name, description, logoUrl } = validation.data;

    await convex.mutation(api.organizations.update, {
      organizationId,
      name,
      description,
      logoUrl,
      updatedBy: convexUser._id,
    });

    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    });

    return NextResponse.json({ organization });
  } catch (error) {
    console.error("Error updating organization:", error);
    return handleApiError(error, "Failed to update organization");
  }
}

/**
 * DELETE /api/organizations/[slug] - Delete an organization
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug } = await params;
    const resolved = await resolveOrgBySlug(convex, slug);

    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Authorization is enforced in the Convex mutation (assertOrgAction)
    await convex.mutation(api.organizations.remove, {
      organizationId,
      deletedBy: convexUser._id,
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting organization:", error);
    return handleApiError(error, "Failed to delete organization");
  }
}
