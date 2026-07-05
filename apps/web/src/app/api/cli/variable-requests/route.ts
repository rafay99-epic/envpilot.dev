import { NextRequest, NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  verifyWorkosBearer,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/cli-auth";
import { createSecret } from "@/lib/vault";
import { resolveLegacyRoles } from "../_lib/legacy-roles";
import { reportApiError } from "@/lib/api-errors";

/**
 * POST-only since the Stage 2 device-flow cutover: request LISTING moved to a
 * direct Convex query from the CLI (variableRequests.listForProject with the
 * caller's JWT). Only CREATE still needs this route, because the submitted
 * value must be encrypted into WorkOS Vault server-side (WORKOS_API_KEY) —
 * that moves into Convex in Stage 3.
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
 * POST /api/cli/variable-requests
 * Submit a variable request (developers only — owners/PMs/team leads should
 * create variables directly). Authenticated by a WorkOS device-flow JWT.
 */
export async function POST(request: NextRequest) {
  const verified = await verifyWorkosBearer(request);
  if (!verified) {
    return unauthorizedResponse("Missing or invalid authorization token");
  }
  const authed = createAuthedConvexClient(verified.token);

  try {
    const body = await request.json();
    const parsed = createRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { key, value, description, environments, projectId, isSensitive } =
      parsed.data;

    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Membership + role checks run as the caller (identity from the JWT).
    const membership = await authed.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
    });

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
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
        return forbiddenResponse(
          "You have Viewer access to this project. Variable requests are not allowed."
        );
      }
      return forbiddenResponse(
        "You are not assigned to this project. Variable requests are not allowed."
      );
    }

    // Owners, project managers, and team leads should create directly.
    if (legacy.role !== "developer") {
      return forbiddenResponse(
        "You have direct write access. Use direct variable creation instead of submitting a request."
      );
    }

    // Store the value in vault first — Convex mutations never talk to Vault
    // directly, they only ever receive/store a vaultRef.
    const vaultResult = await createSecret(key, value, {
      organizationId: project.organizationId,
      projectId,
    });

    const requestId = await authed.mutation(api.variableRequests.create, {
      key,
      vaultRef: vaultResult.id,
      description,
      environments,
      projectId: projectId as Id<"projects">,
      isSensitive,
    });

    return NextResponse.json({
      success: true,
      data: { requestId },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to submit variable request";
    reportApiError(error, "POST /api/cli/variable-requests");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
