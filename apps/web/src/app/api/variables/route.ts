import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { createSecret } from "@/lib/vault";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const createVariableSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(100, "Key must be 100 characters or less")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Key must be uppercase, start with a letter, and contain only letters, numbers, and underscores",
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
 * GET /api/variables - List variables for a project
 */
export async function GET(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const environment = searchParams.get("environment");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 },
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Get project and verify membership
    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">,
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId,
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const variablesWithAccess = await convex.query(
      api.variables.listWithAccess,
      {
        projectId: projectId as Id<"projects">,
        userId: convexUser._id,
      },
    );

    const variables = variablesWithAccess
      .filter((variable) => variable.hasAccess)
      .filter(
        (variable) =>
          !environment || variable.environments.includes(environment),
      );

    return NextResponse.json({ variables });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch variables" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/variables - Create a new environment variable
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createVariableSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { key, value, description, environments, projectId, isSensitive } =
      validation.data;

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Get project and verify membership
    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">,
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId,
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Encrypt value in Vault first. The same encrypted value is used for direct create
    // or for a pending member request.
    const vaultResult = await createSecret(key, value, {
      organizationId,
      projectId,
    });
    const vaultRef = vaultResult.id;

    // Members cannot write directly; they create approval requests.
    if (membership.role === "member") {
      const requestId = await convex.mutation(api.variableRequests.create, {
        key,
        vaultRef,
        description,
        environments,
        projectId: projectId as Id<"projects">,
        isSensitive,
        requestedBy: convexUser._id,
      });

      return NextResponse.json(
        {
          requested: true,
          requestId,
          message: "Variable request submitted for admin approval",
        },
        { status: 202 },
      );
    }

    const variableId = await convex.mutation(api.variables.create, {
      key,
      vaultRef,
      description,
      environments,
      projectId: projectId as Id<"projects">,
      isSensitive,
      createdBy: convexUser._id,
    });

    const variable = await convex.query(api.variables.getById, { variableId });

    return NextResponse.json({ variable }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create variable";

    if (
      message.includes("already exists") ||
      message.includes("pending request")
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
