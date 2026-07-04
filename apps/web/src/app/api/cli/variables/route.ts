import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/cli-auth";
import { createSecret, readSecret } from "@/lib/vault";
import { z } from "zod";
import { isAuthorizationError, resolveLegacyRoles } from "../_lib/legacy-roles";
import { reportApiError } from "@/lib/api-errors";

const createVariableSchema = z.object({
  projectId: z.string().min(1),
  key: z
    .string()
    .min(1)
    .max(256)
    .regex(
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      "Must start with letter/underscore and contain only alphanumeric/underscores"
    ),
  value: z.string().max(65536),
  environment: z.string().min(1),
  description: z.string().max(500).optional(),
  isSensitive: z.boolean().optional(),
});

/**
 * GET /api/cli/variables
 * List variables in a project (with decrypted values)
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const environment = url.searchParams.get("environment");

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing projectId parameter" },
      { status: 400 }
    );
  }

  try {
    // Get project to find organization
    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check membership
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
      userId: authResult.userId,
    });

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    // Get variables with access info
    const variables = await convex.query(api.variables.listWithAccess, {
      projectId: projectId as Id<"projects">,
      userId: authResult.userId,
    });

    // Decrypt values for accessible variables.
    // Use allSettled so a single vault failure doesn't abort all other decryptions.
    const accessible = variables
      .filter((v) => v.hasAccess)
      .filter((v) => !environment || v.environments.includes(environment));

    const settled = await Promise.allSettled(
      accessible.map(async (variable) => {
        // listWithAccess only includes vaultRef when hasAccess is true;
        // the filter above guarantees it, but narrow the type explicitly.
        if (!variable.vaultRef) {
          throw new Error("Missing vault reference");
        }
        const value = await readSecret(variable.vaultRef);
        return {
          _id: variable._id,
          key: variable.key,
          value: value || "",
          // Return the specific environment that was requested, not the full array.
          // The CLI Variable type expects a single string, not string[].
          environment: environment ?? variable.environments[0] ?? "development",
          description: variable.description,
          isSensitive: variable.isSensitive,
          version: variable.version,
          createdAt: variable.createdAt,
          updatedAt: variable.updatedAt,
          // Additive: per-variable unified access. listWithAccess maps a
          // caller's blanket write to "admin"; collapse that to "write".
          access: (variable.permission === "admin"
            ? "write"
            : variable.permission) as "read" | "write",
        };
      })
    );

    const variablesWithValues: Array<{
      _id: string;
      key: string;
      value: string;
      environment: string;
      description?: string;
      isSensitive?: boolean;
      version?: number;
      createdAt?: number;
      updatedAt?: number;
      access: "read" | "write";
    }> = [];
    const decryptionFailures: string[] = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === "fulfilled") {
        variablesWithValues.push(result.value);
      } else {
        // Log enough context to debug vault issues without leaking the value.
        const variable = accessible[i];
        console.error(
          `[CLI Variables] Vault decryption failed for key "${variable.key}" (${variable._id}):`,
          result.reason
        );
        decryptionFailures.push(variable.key);
      }
    }

    // Fire-and-forget: log access for the audit trail (non-blocking)
    Promise.allSettled(
      variablesWithValues.map((v) =>
        convex.mutation(api.variables.logAccess, {
          variableId: v._id as Id<"environmentVariables">,
          accessedBy: authResult.userId!,
          accessType: "export" as const,
          ipAddress,
          userAgent,
          environment: environment || undefined,
        })
      )
    ).catch(() => {
      // Swallow errors — audit logging must never break variable fetch
    });

    // Translate the unified role model into the legacy strings old CLI
    // builds derive .env file protection from. Owners get projectRole null
    // exactly like legacy admins did; grant-only users (per-variable viewer
    // sharing, no assignment) get "viewer" so files stay strictly read-only.
    const legacy = await resolveLegacyRoles(convex, {
      userId: authResult.userId,
      projectId: projectId as Id<"projects">,
      orgRole: membership.role,
    });

    // Additive unified-model meta for new CLIs. Old CLIs read only role /
    // projectRole and ignore these keys.
    const roleHasBlanketWrite =
      (legacy.role === "owner" ||
        legacy.role === "project_manager" ||
        legacy.role === "team_lead") &&
      legacy.assigned;
    const hasWriteAccess =
      roleHasBlanketWrite ||
      variablesWithValues.some((v) => v.access === "write");
    const scopeRestricted =
      legacy.role === "developer" &&
      legacy.assigned &&
      legacy.environmentScope !== null;

    return NextResponse.json({
      success: true,
      data: variablesWithValues,
      meta: {
        total: variablesWithValues.length,
        environment: environment || "all",
        role: legacy.legacyRole,
        projectRole: legacy.role === "owner" ? null : legacy.legacyProjectRole,
        // Additive unified-model fields:
        unifiedRole: legacy.role,
        assigned: legacy.assigned,
        grantOnly: legacy.grantOnly,
        environmentScope: legacy.environmentScope,
        hasWriteAccess,
        scopeRestricted,
        // Non-empty only when vault decryption failed for specific keys.
        // These variables were skipped — they will NOT be injected.
        decryptionFailures:
          decryptionFailures.length > 0 ? decryptionFailures : undefined,
      },
    });
  } catch (error) {
    reportApiError(error, "GET /api/cli/variables");
    console.error("CLI variables error:", error);
    return NextResponse.json(
      { error: "Failed to list variables" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cli/variables
 * Create a new variable
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  try {
    const body = await request.json();
    const parsed = createVariableSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { projectId, key, value, environment, description, isSensitive } =
      parsed.data;

    // Get project to find organization
    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check membership and role
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
      userId: authResult.userId,
    });

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    // Unified role model: owners/project managers/team leads AND assigned
    // developers all create variables directly (the backend auto-grants
    // developers write on variables they create). Users without a project
    // assignment are blocked; grant-only users (per-variable viewer sharing)
    // get the strict read-only treatment old clients expect.
    const legacy = await resolveLegacyRoles(convex, {
      userId: authResult.userId,
      projectId: projectId as Id<"projects">,
      orgRole: membership.role,
    });

    if (!legacy.assigned) {
      if (legacy.grantOnly) {
        return forbiddenResponse(
          "You have Viewer access to this project. Variable creation is not allowed."
        );
      }
      return forbiddenResponse(
        "You are not assigned to this project. Variable creation is not allowed."
      );
    }

    const environments = Array.isArray(environment)
      ? environment
      : [environment];

    // Store value in vault
    const vaultResult = await createSecret(key, value, {
      organizationId: project.organizationId,
      projectId: projectId,
    });
    const vaultRef = vaultResult.id;

    // Create variable
    const variableId = await convex.mutation(api.variables.create, {
      key,
      vaultRef,
      description,
      environments,
      projectId: projectId as Id<"projects">,
      isSensitive: isSensitive ?? false,
      createdBy: authResult.userId,
    });

    return NextResponse.json({
      success: true,
      data: { _id: variableId },
    });
  } catch (error) {
    console.error("CLI create variable error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create variable";
    if (
      message.includes("pending request") ||
      message.includes("already exists")
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    // The Convex mutation is the source of truth for authorization —
    // translate its rejections into the standard FORBIDDEN response.
    if (isAuthorizationError(error)) {
      return forbiddenResponse(
        "You do not have permission to create variables in this project"
      );
    }
    reportApiError(error, "POST /api/cli/variables");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
