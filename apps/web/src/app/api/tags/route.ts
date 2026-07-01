import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  sanitizeConvexError,
  handleApiError,
  isTierLimitError,
} from "@/lib/api-errors";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
} from "@/lib/convex-helpers";
import { roleLevel, ROLE_LEVEL } from "@/lib/roles";

const createTagSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or less")
    .trim(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color"),
});

/**
 * GET /api/tags?organizationId=xxx - List tags for an organization
 */
export async function GET(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Verify membership
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId as Id<"organizations">
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tags = await convex.query(api.tags.listByOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });

    return NextResponse.json({ tags });
  } catch (error) {
    return handleApiError(error, "Failed to fetch tags");
  }
}

/**
 * POST /api/tags - Create a new tag
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validation = createTagSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { organizationId, name, color } = validation.data;

    const convexUser = await getOrCreateConvexUser(convex, user);

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId as Id<"organizations">
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Tag management requires owner / project_manager / team_lead
    if (roleLevel(membership.role) < ROLE_LEVEL.team_lead) {
      return NextResponse.json(
        { error: "Insufficient permissions to manage tags" },
        { status: 403 }
      );
    }

    const tagId = await convex.mutation(api.tags.create, {
      organizationId: organizationId as Id<"organizations">,
      name,
      color,
      createdBy: convexUser._id,
    });

    const tag = await convex.query(api.tags.getById, { tagId });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    const message = sanitizeConvexError(error);

    if (message.includes("already exists")) {
      return NextResponse.json(
        { error: message, code: "TAG_ALREADY_EXISTS" },
        { status: 409 }
      );
    }

    if (isTierLimitError(message)) {
      return NextResponse.json(
        { error: message, code: "TIER_LIMIT_REACHED" },
        { status: 403 }
      );
    }

    return handleApiError(error, "Failed to create tag");
  }
}
