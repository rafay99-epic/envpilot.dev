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

    // Fire-and-forget: log access for anomaly detection (non-blocking)
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

    // Resolve project role for the user
    let projectRole: string | null = null;
    if (membership.role !== "admin") {
      const projectMembership = await convex.query(
        api.projectMembers.getProjectMembership,
        {
          projectId: projectId as Id<"projects">,
          userId: authResult.userId,
        }
      );
      if (projectMembership) {
        projectRole = projectMembership.role;
      }
    }

    return NextResponse.json({
      success: true,
      data: variablesWithValues,
      meta: {
        total: variablesWithValues.length,
        environment: environment || "all",
        role: membership.role,
        projectRole,
        // Non-empty only when vault decryption failed for specific keys.
        // These variables were skipped — they will NOT be injected.
        decryptionFailures:
          decryptionFailures.length > 0 ? decryptionFailures : undefined,
      },
    });
  } catch (error) {
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

    // Resolve project-level role
    let projectRole: string | null = null;
    if (membership.role !== "admin") {
      const projectMembership = await convex.query(
        api.projectMembers.getProjectMembership,
        {
          projectId: projectId as Id<"projects">,
          userId: authResult.userId,
        }
      );
      if (projectMembership) {
        projectRole = projectMembership.role;
      }
    }

    // Determine effective write permission
    const canWriteDirectly =
      membership.role === "admin" ||
      membership.role === "team_lead" ||
      projectRole === "manager";

    const isViewer = projectRole === "viewer";

    // Viewers are hard-blocked from writing
    if (isViewer) {
      return forbiddenResponse(
        "You have Viewer access to this project. Variable creation is not allowed."
      );
    }

    const environments = Array.isArray(environment)
      ? environment
      : [environment];

    // Members and developers create pending requests instead of writing directly.
    if (!canWriteDirectly) {
      const vaultResult = await createSecret(key, value, {
        organizationId: project.organizationId,
        projectId: projectId,
      });
      const requestId = await convex.mutation(api.variableRequests.create, {
        key,
        vaultRef: vaultResult.id,
        description,
        environments,
        projectId: projectId as Id<"projects">,
        isSensitive: isSensitive ?? false,
        requestedBy: authResult.userId,
      });

      return NextResponse.json(
        {
          success: true,
          requested: true,
          data: { requestId },
          message: "Variable request submitted for admin approval",
        },
        { status: 202 }
      );
    }

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
