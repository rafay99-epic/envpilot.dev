import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError, handleApiError } from "@/lib/api-errors";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { createLogger } from "@/lib/logger";
import { createSecret } from "@/lib/vault";

const log = createLogger("api/variables");

const createVariableSchema = z.object({
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
  rotationFrequencyDays: z.number().int().min(0).max(3650).optional(),
  tagIds: z.array(z.string()).optional(),
});

/**
 * GET /api/variables - List variables for a project
 */
export async function GET(request: Request) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const environment = searchParams.get("environment");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Get project and verify membership
    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      createAuthedConvexClient(accessToken!),
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const variablesWithAccess = await convex.query(
      api.variables.listWithAccess,
      {
        projectId: projectId as Id<"projects">,
        userId: convexUser._id,
      }
    );

    const variables = variablesWithAccess
      .filter((variable) => variable.hasAccess)
      .filter(
        (variable) =>
          !environment || variable.environments.includes(environment)
      );

    return NextResponse.json({ variables });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch variables" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/variables - Create a new environment variable
 */
export async function POST(request: Request) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createVariableSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const {
      key,
      value,
      description,
      environments,
      projectId,
      isSensitive,
      rotationFrequencyDays,
      tagIds,
    } = validation.data;

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Get project and verify membership
    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      createAuthedConvexClient(accessToken!),
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Encrypt value in Vault first.
    const vaultResult = await createSecret(key, value, {
      organizationId,
      projectId,
    });
    const vaultRef = vaultResult.id;

    // Unified RBAC: assigned developers create variables directly (they get a
    // write grant on variables they create). Authorization — including project
    // assignment scoping — is enforced by the Convex mutation.
    const variableId = await convex.mutation(api.variables.create, {
      key,
      vaultRef,
      description,
      environments,
      projectId: projectId as Id<"projects">,
      isSensitive,
      createdBy: convexUser._id,
      rotationFrequencyDays,
      tagIds: tagIds as Id<"variableTags">[] | undefined,
    });

    const variable = await convex.query(api.variables.getById, { variableId });

    // Notify project members about variable creation (non-blocking)
    notifyVariableChange(
      convexUser._id,
      key,
      projectId as Id<"projects">,
      organizationId,
      convexUser.name || convexUser.email || "A team member",
      "created"
    );

    return NextResponse.json({ variable }, { status: 201 });
  } catch (error) {
    const message = sanitizeConvexError(error);

    if (
      message.includes("already exists") ||
      message.includes("pending request")
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return handleApiError(error, "Failed to create variable");
  }
}

/**
 * Send variable change notification emails to project members (non-blocking).
 * Fires and forgets — errors are logged but never thrown.
 */
async function notifyVariableChange(
  changerUserId: Id<"users">,
  variableName: string,
  projectId: Id<"projects">,
  organizationId: Id<"organizations">,
  changedByName: string,
  changeType: "created" | "updated" | "deleted"
) {
  try {
    const project = await convex.query(api.projects.getById, { projectId });
    const members = await convex.query(api.organizations.getMembers, {
      organizationId,
    });

    const projectName = project?.name || "Unknown project";

    for (const member of members) {
      if (!member?.user?.email || member.user._id === changerUserId) continue;
      convex
        .action(api.emails.sendVariableChangeEmail, {
          userId: member.user._id,
          to: member.user.email,
          variableName,
          projectName,
          changedByName,
          changeType,
        })
        .catch((err: unknown) =>
          log.error(
            "variable_notification_email_failed",
            { variableName, projectId, changeType },
            err
          )
        );
    }
  } catch (err) {
    log.error(
      "variable_notification_failed",
      { variableName, projectId, changeType },
      err
    );
  }
}
