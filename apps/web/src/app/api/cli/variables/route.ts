import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
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

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

    // Decrypt values for accessible variables
    const variablesWithValues = await Promise.all(
      variables
        .filter((v) => v.hasAccess)
        .filter((v) => !environment || v.environments.includes(environment))
        .map(async (variable) => {
          try {
            // Decrypt the value from vault
            const value = await readSecret(variable.vaultRef);

            return {
              _id: variable._id,
              key: variable.key,
              value: value || "",
              environment: variable.environments,
              description: variable.description,
              isSensitive: variable.isSensitive,
              version: variable.version,
              createdAt: variable.createdAt,
              updatedAt: variable.updatedAt,
            };
          } catch (error) {
            // If decryption fails, return without value
            return {
              _id: variable._id,
              key: variable.key,
              value: "[DECRYPTION_FAILED]",
              environment: variable.environments,
              description: variable.description,
              isSensitive: variable.isSensitive,
              version: variable.version,
              createdAt: variable.createdAt,
              updatedAt: variable.updatedAt,
            };
          }
        })
    );

    return NextResponse.json({
      success: true,
      data: variablesWithValues,
      meta: {
        total: variablesWithValues.length,
        environment: environment || "all",
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

    const environments = Array.isArray(environment)
      ? environment
      : [environment];

    // Members create pending requests instead of writing directly.
    if (membership.role === "member") {
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
