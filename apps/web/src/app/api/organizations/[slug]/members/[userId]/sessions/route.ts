import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { resolveOrgBySlug } from "@/lib/org-slug-resolver";
import { reportApiError } from "@/lib/api-errors";

const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

type RouteParams = { params: Promise<{ slug: string; userId: string }> };

/**
 * GET /api/organizations/[slug]/members/[userId]/sessions
 * List active CLI and extension sessions for a member.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug, userId } = await params;

    if (!CONVEX_ID_PATTERN.test(userId)) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    const resolved = await resolveOrgBySlug(convex, slug);
    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;
    const convexUser = await getOrCreateConvexUser(convex, user);

    const sessions = await convex.query(api.organizations.getMemberSessions, {
      organizationId,
      targetUserId: userId as Id<"users">,
      callerUserId: convexUser._id,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    reportApiError(
      error,
      "GET /api/organizations/[slug]/members/[userId]/sessions"
    );
    console.error("[SESSIONS] Error fetching sessions:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch sessions",
      },
      { status: 500 }
    );
  }
}

const revokeSchema = z.object({
  type: z.enum(["cli", "extension", "all"]),
  sessionId: z.string().optional(),
});

/**
 * DELETE /api/organizations/[slug]/members/[userId]/sessions
 * Revoke CLI token(s), extension session(s), or all sessions for a member.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { slug, userId } = await params;

    if (!CONVEX_ID_PATTERN.test(userId)) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    const resolved = await resolveOrgBySlug(convex, slug);
    if (!resolved) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { organizationId } = resolved;
    const convexUser = await getOrCreateConvexUser(convex, user);

    const body = await request.json();
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { type, sessionId } = parsed.data;
    let revokedCount = 0;

    if (type === "cli" && sessionId) {
      await convex.mutation(api.organizations.revokeMemberCliToken, {
        organizationId,
        tokenId: sessionId as Id<"cliTokens">,
        revokedBy: convexUser._id,
      });
      revokedCount = 1;
    } else if (type === "extension" && sessionId) {
      await convex.mutation(api.organizations.revokeMemberExtensionSession, {
        organizationId,
        projectAccessId: sessionId as Id<"projectAccess">,
        revokedBy: convexUser._id,
      });
      revokedCount = 1;
    } else if (type === "all") {
      const result = await convex.mutation(
        api.organizations.revokeAllMemberSessions,
        {
          organizationId,
          targetUserId: userId as Id<"users">,
          revokedBy: convexUser._id,
        }
      );
      revokedCount = result.revokedCliTokens + result.revokedExtensionSessions;
    } else {
      return NextResponse.json(
        { error: "sessionId is required for single revocation" },
        { status: 400 }
      );
    }

    // Send email notification to the affected user
    if (revokedCount > 0) {
      try {
        // Get the target user's email
        const targetUser = await convex.query(api.users.getById, {
          userId: userId as Id<"users">,
        });
        const org = await convex.query(api.organizations.getById, {
          organizationId,
        });

        if (targetUser?.email && org) {
          await convex.action(api.emails.sendSessionRevocationEmail, {
            to: targetUser.email,
            organizationName: org.name,
            revokedByName: user.firstName
              ? `${user.firstName} ${user.lastName || ""}`.trim()
              : user.email || "An administrator",
            revokedType: type,
            revokedCount,
          });
        }
      } catch (emailErr) {
        reportApiError(
          emailErr,
          "DELETE /api/organizations/[slug]/members/[userId]/sessions"
        );
        console.error("[SESSIONS] Failed to send revocation email:", emailErr);
      }
    }

    return NextResponse.json({ success: true, revokedCount });
  } catch (error) {
    reportApiError(
      error,
      "DELETE /api/organizations/[slug]/members/[userId]/sessions"
    );
    console.error("[SESSIONS] Error revoking sessions:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to revoke sessions",
      },
      { status: 500 }
    );
  }
}
