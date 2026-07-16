import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { reportApiError, sanitizeConvexError } from "@/lib/api-errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/variable-requests/[id]/value
 *
 * Reveal the proposed secret value for a variable request.
 *
 * Authorization is delegated entirely to `api.features.variables.requests.queries.getById`, which
 * throws unless the caller is the requester OR a reviewer (owner / assigned
 * project manager / team lead) of the request's project. The plaintext value
 * is fetched on demand from WorkOS Vault and is NEVER logged.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    // Ensure the `users` row exists so the session JWT resolves server-side.
    await getOrCreateConvexUser(convex, user);
    const requestId = id as Id<"environmentVariableRequests">;

    // The composed Convex action enforces authorization (requester or reviewer,
    // via getById) and reads the plaintext from WorkOS Vault — the value never
    // leaves Convex except in this response and is never logged.
    const { value } = await createAuthedConvexClient(accessToken!).action(
      api.features.variables.requests.actions.revealValue,
      {
        requestId,
      }
    );

    return NextResponse.json({ data: { value } });
  } catch (error) {
    // Classify on the ConvexError PAYLOAD (sanitizeConvexError unwraps .data) —
    // getById / revealValue throw ConvexError, whose plain .message is redacted
    // to "Server Error" in prod so the substrings would never match.
    const message = sanitizeConvexError(error);

    if (message.includes("Not authorized")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (message.includes("not found") || message.includes("Not found")) {
      return NextResponse.json(
        { error: "Variable request not found" },
        { status: 404 }
      );
    }

    reportApiError(error, "GET /api/variable-requests/[id]/value");
    // Generic message to the client — never surface vault internals.
    return NextResponse.json(
      { error: "Failed to read request value" },
      { status: 500 }
    );
  }
}
