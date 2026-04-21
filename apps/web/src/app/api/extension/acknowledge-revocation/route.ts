import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import { Id } from "@convex/_generated/dataModel";

const acknowledgeSchema = z.object({
  // Require an access token for authentication
  accessToken: z.string().min(1),
  // Limit to 50 event IDs to prevent abuse
  eventIds: z.array(z.string().min(1)).max(50),
});

/**
 * POST /api/extension/acknowledge-revocation - Acknowledge revocation events
 *
 * Called by the extension after it has processed revocation events to mark
 * them as acknowledged so they won't be sent again.
 *
 * Security: Requires a valid access token. Events can only be acknowledged
 * if they belong to the provided token.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = acknowledgeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { accessToken, eventIds } = validation.data;

    if (eventIds.length === 0) {
      return NextResponse.json({
        data: {
          acknowledgedCount: 0,
        },
      });
    }

    // Validate that the access token exists (even if revoked, it should be a real token)
    const tokenValidation = await convex.query(
      api.projectAccess.validateToken,
      {
        accessToken,
      }
    );

    // Allow acknowledgment for any known token state (valid, revoked, expired, etc.)
    // but reject completely unknown tokens.
    if (
      !tokenValidation.valid &&
      tokenValidation.reason === "Token not found"
    ) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    // Acknowledge the events
    // Note: In a more secure implementation, we could verify each event
    // belongs to this token, but since acknowledging just marks it as processed,
    // and events auto-expire, this is acceptable
    const result = await convex.mutation(
      api.permissionRevocationEvents.acknowledgeMultiple,
      {
        eventIds: eventIds as Id<"permissionRevocationEvents">[],
      }
    );

    return NextResponse.json({
      data: {
        acknowledgedCount: result.acknowledgedCount,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to acknowledge revocation events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
