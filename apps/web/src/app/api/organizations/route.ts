import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import {
  ACTIVE_ORG_COOKIE_NAME,
  ACTIVE_ORG_COOKIE_TTL_SECONDS,
} from "@/lib/organization-context";
import {
  sanitizeConvexError,
  isTierLimitError,
  handleApiError,
} from "@/lib/api-errors";
import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/feature-flags";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const createOrgSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/organizations - List all organizations for the current user
 */
export async function GET() {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // First, ensure the user exists in Convex
    let convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    });

    if (!convexUser) {
      // Sync the user first
      const userId = await convex.mutation(api.users.upsert, {
        workosId: user.id,
        email: user.email,
        name:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.firstName || user.lastName || undefined,
        avatarUrl: user.profilePictureUrl || undefined,
      });
      convexUser = await convex.query(api.users.getById, { userId });
    }

    if (!convexUser) {
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 }
      );
    }

    const organizations = await convex.query(api.organizations.listForUser, {
      userId: convexUser._id,
    });

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations - Create a new organization
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createOrgSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Ensure user exists in Convex
    let convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    });

    if (!convexUser) {
      const userId = await convex.mutation(api.users.upsert, {
        workosId: user.id,
        email: user.email,
        name:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.firstName || user.lastName || undefined,
        avatarUrl: user.profilePictureUrl || undefined,
      });
      convexUser = await convex.query(api.users.getById, { userId });
    }

    if (!convexUser) {
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 }
      );
    }

    const { name, slug, description } = validation.data;

    const organizationId = await convex.mutation(api.organizations.create, {
      name,
      slug,
      description,
      createdBy: convexUser._id,
      enforceTierLimits: isFeatureEnabled(FEATURE_FLAGS.TIER_LIMITS),
    });

    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    });

    const response = NextResponse.json({ organization }, { status: 201 });
    response.cookies.set(ACTIVE_ORG_COOKIE_NAME, organizationId, {
      path: "/",
      sameSite: "lax",
      maxAge: ACTIVE_ORG_COOKIE_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Error creating organization:", error);
    const message = sanitizeConvexError(error);

    if (message.includes("slug already exists")) {
      return NextResponse.json(
        { error: "Organization slug already exists" },
        { status: 409 }
      );
    }

    return handleApiError(error, "Failed to create organization");
  }
}
