import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { sanitizeConvexError, handleApiError } from "@/lib/api-errors";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
} from "@/lib/convex-helpers";
import { roleLevel, ROLE_LEVEL } from "@/lib/roles";

const updateTagSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or less")
    .trim()
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color")
    .optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Shared helper — resolves tag + validates owner/project_manager/team_lead membership.
 * Returns { tag, membership, convexUser } or a NextResponse error.
 */
async function resolveTagWithAuth(tagId: string) {
  const { user } = await withAuth();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const convexUser = await getOrCreateConvexUser(convex, user);

  const tag = await convex.query(api.tags.getById, {
    tagId: tagId as Id<"variableTags">,
  });

  if (!tag) {
    return {
      error: NextResponse.json({ error: "Tag not found" }, { status: 404 }),
    };
  }

  const membership = await checkOrganizationMembership(
    convex,
    convexUser._id,
    tag.organizationId
  );

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  // Tag management requires owner / project_manager / team_lead
  if (roleLevel(membership.role) < ROLE_LEVEL.team_lead) {
    return {
      error: NextResponse.json(
        { error: "Insufficient permissions to manage tags" },
        { status: 403 }
      ),
    };
  }

  return { tag, membership, convexUser };
}

/**
 * PATCH /api/tags/[id] - Update a tag
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validation = updateTagSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Must provide at least one field to update
    if (!validation.data.name && !validation.data.color) {
      return NextResponse.json(
        { error: "At least one field (name or color) must be provided" },
        { status: 400 }
      );
    }

    const resolved = await resolveTagWithAuth(id);
    if ("error" in resolved) return resolved.error;

    const { convexUser } = resolved;

    await convex.mutation(api.tags.update, {
      tagId: id as Id<"variableTags">,
      name: validation.data.name,
      color: validation.data.color,
      updatedBy: convexUser._id,
    });

    const updatedTag = await convex.query(api.tags.getById, {
      tagId: id as Id<"variableTags">,
    });

    return NextResponse.json({ tag: updatedTag });
  } catch (error) {
    const message = sanitizeConvexError(error);

    if (message.includes("already exists")) {
      return NextResponse.json(
        { error: message, code: "TAG_ALREADY_EXISTS" },
        { status: 409 }
      );
    }

    return handleApiError(error, "Failed to update tag");
  }
}

/**
 * DELETE /api/tags/[id] - Delete a tag (soft-delete)
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const resolved = await resolveTagWithAuth(id);
    if ("error" in resolved) return resolved.error;

    const { convexUser } = resolved;

    const result = await convex.mutation(api.tags.remove, {
      tagId: id as Id<"variableTags">,
      deletedBy: convexUser._id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Failed to delete tag");
  }
}
