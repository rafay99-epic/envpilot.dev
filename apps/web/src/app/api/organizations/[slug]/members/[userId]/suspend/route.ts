import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { resolveOrgBySlug } from "@/lib/org-slug-resolver";
import { revokeWorkosSessions } from "@/lib/workos-sessions";
import { reportApiError } from "@/lib/api-errors";

const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

type RouteParams = { params: Promise<{ slug: string; userId: string }> };

const suspendSchema = z.object({
  reason: z.string().max(500).optional(),
  // Org credentials (created by the target) the admin opted to revoke too.
  revokeCredentials: z
    .array(
      z.object({
        type: z.literal("api_key"),
        id: z.string().regex(CONVEX_ID_PATTERN),
      })
    )
    .max(100)
    .optional(),
});

/**
 * POST /api/organizations/[slug]/members/[userId]/suspend
 * Security hold: freeze the member's access org-wide, kill their sessions
 * (WorkOS revocation happens here — Convex can't call WorkOS), and
 * optionally revoke org credentials they created.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();
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

    const body = await request.json().catch(() => ({}));
    const parsed = suspendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const client = createAuthedConvexClient(accessToken!);

    const result = await client.mutation(
      api.features.organizations.securityHold.suspendMemberAccess,
      {
        organizationId,
        targetUserId: userId as Id<"users">,
        reason: parsed.data.reason,
      }
    );

    // Real remote sign-out: revoke the WorkOS sessions server-side so the
    // devices' refresh tokens stop working (web tab included).
    await revokeWorkosSessions(result.sessionIds);

    // Opt-in credential sweep — each revocation is authorized and audited by
    // its own mutation. Failures are collected, not silently swallowed.
    const credentialErrors: string[] = [];
    for (const cred of parsed.data.revokeCredentials ?? []) {
      try {
        await client.mutation(api.features.api.keys.revoke, {
          keyId: cred.id as Id<"apiKeys">,
        });
      } catch (err) {
        reportApiError(
          err,
          "POST /api/organizations/[slug]/members/[userId]/suspend (credential sweep)"
        );
        credentialErrors.push(`${cred.type} ${cred.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      alreadySuspended: result.alreadySuspended,
      revokedCliTokens: result.revokedCliTokens,
      revokedExtensionSessions: result.revokedExtensionSessions,
      credentialErrors: credentialErrors.length ? credentialErrors : undefined,
    });
  } catch (error) {
    reportApiError(
      error,
      "POST /api/organizations/[slug]/members/[userId]/suspend"
    );
    console.error("[SUSPEND] Error suspending member:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to suspend member",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/organizations/[slug]/members/[userId]/suspend
 * Reinstate a suspended member — role/assignments/grants were never
 * touched, so access is restored exactly as it was.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();
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

    const result = await createAuthedConvexClient(accessToken!).mutation(
      api.features.organizations.securityHold.reinstateMemberAccess,
      {
        organizationId: resolved.organizationId,
        targetUserId: userId as Id<"users">,
      }
    );

    return NextResponse.json({ success: true, reinstated: result.reinstated });
  } catch (error) {
    reportApiError(
      error,
      "DELETE /api/organizations/[slug]/members/[userId]/suspend"
    );
    console.error("[SUSPEND] Error reinstating member:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to reinstate member",
      },
      { status: 500 }
    );
  }
}
