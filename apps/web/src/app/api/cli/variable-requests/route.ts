import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/cli-auth";
import { createSecret } from "@/lib/vault";
import { isAuthorizationError, resolveLegacyRoles } from "../_lib/legacy-roles";
import { reportApiError } from "@/lib/api-errors";

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
 * GET /api/cli/variable-requests?projectId=...&status=pending
 * List variable requests for the authenticated CLI user's project.
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const status = url.searchParams.get("status") || undefined;

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing projectId parameter" },
      { status: 400 }
    );
  }

  try {
    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
      userId: authResult.userId,
    });

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    const requests = await convex.query(api.variableRequests.listForProject, {
      projectId: projectId as Id<"projects">,
      userId: authResult.userId,
      status: status as
        | "pending"
        | "approved"
        | "rejected"
        | "canceled"
        | undefined,
    });

    return NextResponse.json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    console.error("CLI variable-requests list error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch variable requests";
    reportApiError(error, "GET /api/cli/variable-requests");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/cli/variable-requests
 * Submit a variable request (developers only — owners/PMs/team leads should
 * create variables directly).
 */
export async function POST(request: NextRequest) {
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

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

    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
      userId: authResult.userId,
    });

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    // Unified role model: only developers assigned to the project submit
    // variable requests. Owners/project managers/team leads create directly;
    // unassigned users (including per-variable viewer grants) are blocked.
    const legacy = await resolveLegacyRoles(convex, {
      userId: authResult.userId,
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

    const requestId = await convex.mutation(api.variableRequests.create, {
      key,
      vaultRef: vaultResult.id,
      description,
      environments,
      projectId: projectId as Id<"projects">,
      isSensitive,
      requestedBy: authResult.userId,
    });

    const createdRequest = await convex.query(api.variableRequests.getById, {
      requestId,
      userId: authResult.userId,
    });

    return NextResponse.json(
      { success: true, data: { request: createdRequest } },
      { status: 201 }
    );
  } catch (error) {
    console.error("CLI create variable request error:", error);
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
    // The Convex mutation is the source of truth for authorization —
    // translate its rejections into the standard FORBIDDEN response. Pass the
    // real message through: scope errors ("Your access is limited to these
    // environments: …") tell the developer exactly what to change.
    if (isAuthorizationError(error)) {
      return forbiddenResponse(message);
    }
    reportApiError(error, "POST /api/cli/variable-requests");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
