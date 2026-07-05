import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { createLogger } from "@/lib/logger";
import { reportApiError } from "@/lib/api-errors";
import { normalizeOrgRole, roleLevel, ROLE_LEVEL } from "@/lib/roles";

const log = createLogger("api/variables/[id]");

const updateVariableSchema = z.object({
  value: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  environments: z
    .array(z.enum(["development", "staging", "production"]))
    .min(1)
    .optional(),
  isSensitive: z.boolean().optional(),
  changeReason: z.string().max(200).optional(),
  rotationFrequencyDays: z.number().int().min(0).max(3650).optional(),
  tagIds: z.array(z.string()).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/variables/[id] - Get a single variable with version history
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;

    const convexUser = await getOrCreateConvexUser(convex, user);

    const variable = await convex.query(api.variables.getById, {
      variableId: id as Id<"environmentVariables">,
    });

    if (!variable) {
      return NextResponse.json(
        { error: "Variable not found" },
        { status: 404 }
      );
    }

    // Verify user has access to the project
    const { organizationId } = await getProjectOrganization(
      convex,
      variable.projectId
    );

    if (!organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      createAuthedConvexClient(accessToken!),
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Developers can only view variables they hold a grant on.
    if (normalizeOrgRole(membership.role) === "developer") {
      const accessibleVariables = await createAuthedConvexClient(
        accessToken!
      ).query(api.variables.listWithAccess, {
        projectId: variable.projectId,
      });

      const canAccessVariable = accessibleVariables.some(
        (entry) => entry._id === variable._id && entry.hasAccess
      );

      if (!canAccessVariable) {
        return NextResponse.json(
          { error: "You do not have access to this variable" },
          { status: 403 }
        );
      }
    }

    // Get version history
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get("includeHistory") === "true";

    let history = null;
    if (includeHistory) {
      history = await createAuthedConvexClient(accessToken!).query(
        api.variables.getVersionHistory,
        {
          variableId: id as Id<"environmentVariables">,
          limit: 50,
        }
      );
    }

    return NextResponse.json({ variable, history });
  } catch (error) {
    reportApiError(error, "GET /api/variables/[id]");
    return NextResponse.json(
      { error: "Failed to fetch variable" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/variables/[id] - Update a variable
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateVariableSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    const variable = await convex.query(api.variables.getById, {
      variableId: id as Id<"environmentVariables">,
    });

    if (!variable) {
      return NextResponse.json(
        { error: "Variable not found" },
        { status: 404 }
      );
    }

    // Verify user has access to the project
    const { organizationId } = await getProjectOrganization(
      convex,
      variable.projectId
    );

    if (!organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      createAuthedConvexClient(accessToken!),
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // No role gate here: owners/project managers/team leads can update, and
    // developers holding a write grant on this variable can too. The Convex
    // mutation enforces the full access rules (getVariableAccess).
    const {
      value,
      description,
      environments,
      isSensitive,
      changeReason,
      rotationFrequencyDays,
      tagIds,
    } = validation.data;

    // When the value changes, the composed Convex action mints a NEW vault
    // object (the previous ref stays referenced by earlier variableVersions
    // rows — that is what makes rollback restore the old value) and best-effort
    // deletes the new ref if the write authorization rejects. Metadata-only
    // updates skip Vault entirely.
    await createAuthedConvexClient(accessToken!).action(
      api.variableValues.updateWithValue,
      {
        variableId: id as Id<"environmentVariables">,
        value,
        description,
        environments,
        isSensitive,
        changeReason,
        rotationFrequencyDays,
        tagIds: tagIds as Id<"variableTags">[] | undefined,
      }
    );

    const updatedVariable = await convex.query(api.variables.getById, {
      variableId: id as Id<"environmentVariables">,
    });

    // Notify project members about variable update (non-blocking)
    notifyVariableChange(
      convexUser._id,
      variable.key,
      variable.projectId,
      organizationId,
      convexUser.name || convexUser.email || "A team member",
      "updated"
    );

    return NextResponse.json({ variable: updatedVariable });
  } catch (error) {
    console.error("[PATCH /api/variables/[id]]", error);
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Insufficient") ||
      message.includes("permission") ||
      message.includes("No access")
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    reportApiError(error, "PATCH /api/variables/[id]");
    return NextResponse.json(
      {
        error: "Failed to update variable",
        details: message,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/variables/[id] - Soft delete a variable
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;

    const convexUser = await getOrCreateConvexUser(convex, user);

    const variable = await convex.query(api.variables.getById, {
      variableId: id as Id<"environmentVariables">,
    });

    if (!variable) {
      return NextResponse.json(
        { error: "Variable not found" },
        { status: 404 }
      );
    }

    // Verify user has access to the project
    const { organizationId } = await getProjectOrganization(
      convex,
      variable.projectId
    );

    if (!organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      createAuthedConvexClient(accessToken!),
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete requires owner / project_manager / team_lead (Convex enforces
    // project-assignment scoping for non-owners).
    if (roleLevel(membership.role) < ROLE_LEVEL.team_lead) {
      return NextResponse.json(
        { error: "Insufficient permissions to delete variables" },
        { status: 403 }
      );
    }

    await createAuthedConvexClient(accessToken!).mutation(
      api.variables.remove,
      {
        variableId: id as Id<"environmentVariables">,
      }
    );

    // Notify project members about variable deletion (non-blocking)
    notifyVariableChange(
      convexUser._id,
      variable.key,
      variable.projectId,
      organizationId,
      convexUser.name || convexUser.email || "A team member",
      "deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    reportApiError(error, "DELETE /api/variables/[id]");
    return NextResponse.json(
      { error: "Failed to delete variable" },
      { status: 500 }
    );
  }
}

/**
 * Send variable change notification emails to project members (non-blocking).
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
