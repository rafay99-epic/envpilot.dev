import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { z } from "zod";

// Convex ID pattern - alphanumeric characters only
const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

const searchSchema = z.object({
  // Search query: alphanumeric, email chars, and spaces only, max 100 chars
  q: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9@._\-\s]+$/, "Invalid search characters"),
  organizationId: z
    .string()
    .regex(CONVEX_ID_PATTERN, "Invalid organization ID"),
  limit: z.coerce.number().min(1).max(20).optional().default(10),
});

/**
 * GET /api/users/search - Search for users by email or name
 */
export async function GET(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryParams = {
      q: searchParams.get("q") || "",
      organizationId: searchParams.get("organizationId") || "",
      limit: searchParams.get("limit") || undefined,
    };

    const validation = searchSchema.safeParse(queryParams);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid search parameters",
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { q, organizationId, limit } = validation.data;
    const orgId = organizationId as Id<"organizations">;

    // Search for users scoped to the organization
    const users = await convex.query(api.users.search, {
      searchTerm: q,
      organizationId: orgId,
      limit,
    });

    // Check membership status and pending invitations
    const [members, invitations] = await Promise.all([
      convex.query(api.organizations.getMembers, { organizationId: orgId }),
      convex.query(api.invitations.listPendingByOrganization, {
        organizationId: orgId,
      }),
    ]);

    const memberIds = new Set(
      members
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map((m) => m.userId)
    );
    const pendingEmails = new Set(
      invitations.map((i) => i.email.toLowerCase())
    );

    const enrichedUsers = users.map((u) => ({
      _id: u._id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      isMember: memberIds.has(u._id),
      hasPendingInvitation: pendingEmails.has(u.email.toLowerCase()),
    }));

    return NextResponse.json({ users: enrichedUsers });
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
}
