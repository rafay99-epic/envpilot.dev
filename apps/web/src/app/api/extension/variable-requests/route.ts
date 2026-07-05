import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { getProjectOrganization } from "@/lib/convex-helpers";
import { verifyWorkosBearer } from "@/lib/cli-auth";
import { createSecret } from "@/lib/vault";
import { isAuthorizationError, resolveLegacyRoles } from "../_lib/legacy-roles";
import { reportApiError } from "@/lib/api-errors";

/**
 * POST-only since the Stage 2 device-flow cutover: request LISTING moved to a
 * direct Convex query from the extension (variableRequests.listForProject with
 * the caller's JWT). Only CREATE still needs this route, because the submitted
 * value must be encrypted into WorkOS Vault server-side — that moves into
 * Convex in Stage 3.
 */
const createRequestSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(100, "Key must be 100 characters or less")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Key must be uppercase, start with a letter, and contain only letters, numbers, and underscores"
    ),
  value: z.string().min(1, "Value is required"),
  description: z.string().max(500).optional(),
  environments: z
    .array(z.enum(["development", "staging", "production"]))
    .min(1, "At least one environment is required"),
  projectId: z.string().min(1, "Project ID is required"),
  isSensitive: z.boolean().optional().default(false),
});

/**
 * POST /api/extension/variable-requests
 * Submit a variable request (developers only). Authenticated by a WorkOS
 * device-flow JWT in the Authorization header.
 */
export async function POST(request: Request) {
  try {
    const verified = await verifyWorkosBearer(request);
    if (!verified) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const authed = createAuthedConvexClient(verified.token);

    const body = await request.json();
    const validation = createRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { key, value, description, environments, projectId, isSensitive } =
      validation.data;

    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Membership + role checks run as the caller (identity from the JWT).
    const membership = await authed.query(api.organizations.getMembership, {
      organizationId,
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Unified role model: only developers assigned to the project submit
    // variable requests. Owners/project managers/team leads create directly;
    // unassigned users (including per-variable viewer grants) are blocked.
    const legacy = await resolveLegacyRoles(authed, {
      projectId: projectId as Id<"projects">,
      orgRole: membership.role,
    });

    if (!legacy.assigned) {
      if (legacy.grantOnly) {
        return NextResponse.json(
          {
            error:
              "You have Viewer access to this project. Variable requests are not allowed.",
          },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Owners, project managers, and team leads should create directly
    if (legacy.role !== "developer") {
      return NextResponse.json(
        {
          error:
            "You have direct write access. Use direct variable creation instead of submitting a request.",
        },
        { status: 403 }
      );
    }

    // Store the value in vault
    const vaultResult = await createSecret(key, value, {
      organizationId,
      projectId,
    });

    // Create the request in Convex — actor derived from the verified JWT.
    const requestId = await authed.mutation(api.variableRequests.create, {
      key,
      vaultRef: vaultResult.id,
      description,
      environments,
      projectId: projectId as Id<"projects">,
      isSensitive,
    });

    const createdRequest = await authed.query(api.variableRequests.getById, {
      requestId,
    });

    return NextResponse.json(
      { data: { request: createdRequest } },
      { status: 201 }
    );
  } catch (error) {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "Failed to create variable request";
    // Convex wraps thrown errors as "[Request ID: …] Server Error\nUncaught
    // Error: <real message>\n at …" — surface only the real message.
    const message =
      rawMessage.match(/Uncaught Error: ([^\n]+)/)?.[1] ?? rawMessage;
    if (
      message.includes("already exists") ||
      message.includes("pending request")
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (isAuthorizationError(error)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    reportApiError(error, "POST /api/extension/variable-requests");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
