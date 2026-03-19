import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError, handleApiError } from "@/lib/api-errors";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { createSecret } from "@/lib/vault";
import { verifyNotBot } from "@/lib/botid";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
      convex,
      convexUser._id,
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
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    const { user } = await withAuth();

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
      convex,
      convexUser._id,
      organizationId
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

      // Notify admins/team leads about the access request (non-blocking)
      notifyAccessRequest(
        convexUser._id,
        convexUser.name || convexUser.email || "A team member",
        key,
        projectId as Id<"projects">,
        organizationId
      );

      return NextResponse.json(
        {
          requested: true,
          requestId,
          message: "Variable request submitted for admin approval",
        },
        { status: 202 }
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
      rotationFrequencyDays,
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
          console.warn("[EMAIL] Variable notification failed:", err)
        );
    }
  } catch (err) {
    console.warn("[EMAIL] Error sending variable notifications:", err);
  }
}

/**
 * Send access request notification emails to admins/team leads (non-blocking).
 */
async function notifyAccessRequest(
  requesterUserId: Id<"users">,
  requesterName: string,
  variableName: string,
  projectId: Id<"projects">,
  organizationId: Id<"organizations">
) {
  try {
    const project = await convex.query(api.projects.getById, { projectId });
    const org = await convex.query(api.organizations.getById, {
      organizationId,
    });
    const members = await convex.query(api.organizations.getMembers, {
      organizationId,
    });

    const projectName = project?.name || "Unknown project";
    const orgName = org?.name || "Unknown organization";

    for (const member of members) {
      if (!member?.user?.email || member.user._id === requesterUserId) continue;
      if (member.role !== "admin" && member.role !== "team_lead") continue;

      convex
        .action(api.emails.sendAccessRequestEmail, {
          userId: member.user._id,
          to: member.user.email,
          requesterName,
          variableName,
          projectName,
          organizationName: orgName,
        })
        .catch((err: unknown) =>
          console.warn("[EMAIL] Access request notification failed:", err)
        );
    }
  } catch (err) {
    console.warn("[EMAIL] Error sending access request notifications:", err);
  }
}
