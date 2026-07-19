import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { handleApiError } from "@/lib/api-errors";
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
    const { user, accessToken } = await withAuth();
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

    // Sync the Convex user BEFORE any identity-authed query — a first-time
    // WorkOS session has no users row yet, so authed queries would fail
    // server-side before the row is created.
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken!);

    // Get the project
    const project = await authed.query(api.features.projects.queries.getById, {
      projectId: id as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check org membership and role
    const membership = await authed.query(
      api.features.organizations.queries.getMembership,
      {
        organizationId: project.organizationId,
      }
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    // Check bulk_import feature gate
    const featureCheck = await convex.query(
      api.features.featureRegistry.queries.checkFeature,
      {
        organizationId: project.organizationId,
        featureKey: "bulk_import",
      }
    );

    if (featureCheck && !featureCheck.allowed) {
      return NextResponse.json(
        {
          error: `Bulk import is not available on your current plan${featureCheck.tierName ? ` (${featureCheck.tierName})` : ""}. Upgrade to access this feature.`,
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

    // All Vault crypto + diffing lives in Convex. The composed action decides,
    // from the caller's role, whether to write directly (team_lead+: encrypt +
    // create/update/remove with a value diff) or file variable requests
    // (developers). It returns which path it took so the response shape matches.
    const entries = Object.entries(validVars).map(([key, value]) => ({
      key,
      value,
    }));

    const result = await authed.action(
      api.features.variables.values.importValues,
      {
        projectId: id as Id<"projects">,
        environment,
        mode,
        changeReason: `Updated via ${format} import`,
        entries,
      }
    );

    if (result.path === "requests") {
      return NextResponse.json(
        {
          success: true,
          requested: true,
          data: {
            created: 0,
            updated: 0,
            deleted: 0,
            requested: result.requested,
            skipped: result.skipped,
            invalidKeys,
            total: Object.keys(parsedVars).length,
          },
          message: "Variable requests submitted for admin approval",
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
        invalidKeys,
        total: Object.keys(parsedVars).length,
      },
    });
  } catch (error) {
    console.error("Error importing variables:", error);
    return handleApiError(error, "Failed to import variables");
  }
}
