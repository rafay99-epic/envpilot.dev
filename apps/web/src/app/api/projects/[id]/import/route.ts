import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { handleApiError } from "@/lib/api-errors";
import { createSecret, readSecret } from "@/lib/vault";
import { parse, ALL_FORMATS, type FormatType } from "@/lib/format-converter";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/import - Import environment variables from various formats
 *
 * Body (JSON):
 *   content - string (file content to parse)
 *   format - "env" | "json" | "yaml" | "docker-compose" | "aws" | "vercel" | "netlify"
 *   environment - "development" | "staging" | "production"
 *   mode - "merge" | "replace" (default: "merge")
 *   prefix - string (optional, for AWS format)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      content,
      format,
      environment,
      mode = "merge",
      prefix,
    } = body as {
      content: string;
      format: FormatType;
      environment: string;
      mode?: "merge" | "replace";
      prefix?: string;
    };

    // Validate inputs
    if (!content || !format || !environment) {
      return NextResponse.json(
        { error: "Missing required fields: content, format, environment" },
        { status: 400 }
      );
    }

    if (!ALL_FORMATS.includes(format)) {
      return NextResponse.json(
        { error: `Format must be one of: ${ALL_FORMATS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!["development", "staging", "production"].includes(environment)) {
      return NextResponse.json(
        {
          error:
            "Environment must be 'development', 'staging', or 'production'",
        },
        { status: 400 }
      );
    }

    if (mode !== "merge" && mode !== "replace") {
      return NextResponse.json(
        { error: "Mode must be 'merge' or 'replace'" },
        { status: 400 }
      );
    }

    // Get the project
    const project = await convex.query(api.projects.getById, {
      projectId: id as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get or create Convex user
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check org membership and role
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
      userId: convexUser._id,
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    // Check bulk_import feature gate
    const featureCheck = await convex.query(api.featureRegistry.checkFeature, {
      organizationId: project.organizationId,
      featureKey: "bulk_import",
    });

    if (featureCheck && !featureCheck.allowed) {
      return NextResponse.json(
        {
          error: `Bulk import is not available on your current plan${featureCheck.tierName ? ` (${featureCheck.tierName})` : ""}. Upgrade to access this feature.`,
        },
        { status: 403 }
      );
    }

    // Determine write permissions
    let projectRole: string | null = null;
    if (membership.role !== "admin") {
      const projectMembership = await convex.query(
        api.projectMembers.getProjectMembership,
        {
          projectId: id as Id<"projects">,
          userId: convexUser._id,
        }
      );
      if (projectMembership) {
        projectRole = projectMembership.role;
      }
    }

    const canWriteDirectly =
      membership.role === "admin" ||
      membership.role === "team_lead" ||
      projectRole === "manager";

    if (projectRole === "viewer") {
      return NextResponse.json(
        {
          error:
            "You have Viewer access to this project. Import is not allowed.",
        },
        { status: 403 }
      );
    }

    // Parse the content
    let parsedVars: Record<string, string>;
    try {
      parsedVars = parse(content, format, { prefix });
    } catch (parseError) {
      return NextResponse.json(
        {
          error: `Failed to parse ${format} content: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        },
        { status: 400 }
      );
    }

    // Validate keys
    const validVars: Record<string, string> = {};
    const invalidKeys: string[] = [];
    for (const [key, value] of Object.entries(parsedVars)) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        validVars[key] = value;
      } else {
        invalidKeys.push(key);
      }
    }

    if (Object.keys(validVars).length === 0) {
      return NextResponse.json(
        { error: "No valid variables found in the imported content" },
        { status: 400 }
      );
    }

    // For members/developers, create pending requests
    if (!canWriteDirectly) {
      let requested = 0;
      let skipped = 0;

      for (const [key, value] of Object.entries(validVars)) {
        try {
          const vaultResult = await createSecret(key, value, {
            organizationId: project.organizationId,
            projectId: id,
          });

          await convex.mutation(api.variableRequests.create, {
            key,
            vaultRef: vaultResult.id,
            environments: [environment],
            projectId: id as Id<"projects">,
            isSensitive: false,
            requestedBy: convexUser._id,
          });
          requested++;
        } catch {
          skipped++;
        }
      }

      return NextResponse.json(
        {
          success: true,
          requested: true,
          data: {
            created: 0,
            updated: 0,
            deleted: 0,
            requested,
            skipped,
            invalidKeys,
            total: Object.keys(parsedVars).length,
          },
          message: "Variable requests submitted for admin approval",
        },
        { status: 202 }
      );
    }

    // Get existing variables for comparison
    const existingVariables = await convex.query(api.variables.listByProject, {
      projectId: id as Id<"projects">,
      environment,
    });

    const existingByKey = new Map(existingVariables.map((v) => [v.key, v]));

    let created = 0;
    let updated = 0;
    let deleted = 0;

    // Process each variable
    for (const [key, value] of Object.entries(validVars)) {
      const existing = existingByKey.get(key);

      if (existing) {
        // Check if value changed
        const currentValue = await readSecret(existing.vaultRef);
        if (currentValue !== value) {
          const vaultResult = await createSecret(key, value, {
            organizationId: project.organizationId,
            projectId: id,
          });

          await convex.mutation(api.variables.update, {
            variableId: existing._id,
            vaultRef: vaultResult.id,
            updatedBy: convexUser._id,
            changeReason: `Updated via ${format} import`,
          });
          updated++;
        }
        existingByKey.delete(key);
      } else {
        // Create new variable
        const vaultResult = await createSecret(key, value, {
          organizationId: project.organizationId,
          projectId: id,
        });

        await convex.mutation(api.variables.create, {
          key,
          vaultRef: vaultResult.id,
          environments: [environment],
          projectId: id as Id<"projects">,
          isSensitive: false,
          createdBy: convexUser._id,
        });
        created++;
      }
    }

    // In replace mode, delete remaining existing variables
    if (mode === "replace") {
      for (const [, variable] of existingByKey) {
        await convex.mutation(api.variables.remove, {
          variableId: variable._id,
          deletedBy: convexUser._id,
        });
        deleted++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        deleted,
        invalidKeys,
        total: Object.keys(parsedVars).length,
      },
    });
  } catch (error) {
    console.error("Error importing variables:", error);
    return handleApiError(error, "Failed to import variables");
  }
}
