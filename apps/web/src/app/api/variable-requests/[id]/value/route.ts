import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { readSecret } from "@/lib/vault";
import { reportApiError } from "@/lib/api-errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/variable-requests/[id]/value
 *
 * Reveal the proposed secret value for a variable request.
 *
 * Authorization is delegated entirely to `api.variableRequests.getById`, which
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

    // getById enforces authorization (requester or reviewer) and returns the
    // request document including its vaultRef.
    const variableRequest = await createAuthedConvexClient(accessToken!).query(
      api.variableRequests.getById,
      {
        requestId,
      }
    );

    if (!variableRequest) {
      return NextResponse.json(
        { error: "Variable request not found" },
        { status: 404 }
      );
    }

    const value = await readSecret(variableRequest.vaultRef);

    return NextResponse.json({ data: { value } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read request value";

    if (message.includes("Not authorized")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    reportApiError(error, "GET /api/variable-requests/[id]/value");
    // Generic message to the client — never surface vault internals.
    return NextResponse.json(
      { error: "Failed to read request value" },
      { status: 500 }
    );
  }
}
