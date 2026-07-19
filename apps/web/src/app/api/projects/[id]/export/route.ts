import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { reportApiError } from "@/lib/api-errors";
import {
  serialize,
  getFileExtension,
  getContentType,
  ALL_FORMATS,
  type FormatType,
} from "@/lib/format-converter";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/export - Export environment variables
 *
 * Query params:
 *   environment - "development" | "staging" | "production" (optional, default: all)
 *   format - "env" | "json" | "yaml" | "docker-compose" | "aws" | "vercel" | "netlify" (optional, default: "env")
 *   prefix - AWS Parameter Store prefix (optional, default: /project-name)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const environment = url.searchParams.get("environment") || undefined;
    const format = (url.searchParams.get("format") || "env") as FormatType;
    const prefix = url.searchParams.get("prefix") || undefined;

    if (!ALL_FORMATS.includes(format)) {
      return NextResponse.json(
        { error: `Format must be one of: ${ALL_FORMATS.join(", ")}` },
        { status: 400 }
      );
    }

    if (
      environment &&
      !["development", "staging", "production"].includes(environment)
    ) {
      return NextResponse.json(
        {
          error:
            "Environment must be 'development', 'staging', or 'production'",
        },
        { status: 400 }
      );
    }

    // Sync the Convex user BEFORE any identity-authed query — a first-time
    // WorkOS session has no users row yet, so authed queries would fail
    // server-side before the row is created.
    const convexUser = await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken!);

    // Get the project
    const project = await authed.query(api.features.projects.queries.getById, {
      projectId: id as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check org membership
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

    // Check bulk_export feature gate
    const featureCheck = await convex.query(
      api.features.featureRegistry.queries.checkFeature,
      {
        organizationId: project.organizationId,
        featureKey: "bulk_export",
      }
    );

    if (featureCheck && !featureCheck.allowed) {
      return NextResponse.json(
        {
          error: `Bulk export is not available on your current plan${featureCheck.tierName ? ` (${featureCheck.tierName})` : ""}. Upgrade to access this feature.`,
        },
        { status: 403 }
      );
    }

    // Fetch + decrypt the caller's accessible, in-scope variable values via the
    // composed Convex action (access control + Vault reads live in Convex; a
    // per-variable decrypt failure yields "[DECRYPTION_FAILED]" for that key).
    const { values } = await authed.action(
      api.features.variables.values.exportValues,
      {
        projectId: id as Id<"projects">,
        environment,
      }
    );

    const decrypted: Record<string, string> = Object.fromEntries(
      values.map((entry) => [entry.key, entry.value])
    );

    const body = serialize(decrypted, format, {
      projectName: project.name,
      environment: environment || "all",
      prefix,
    });

    const ext = getFileExtension(format);
    const contentType = getContentType(format);
    const filename = `${environment || "all"}${ext}`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    reportApiError(error, "GET /api/projects/[id]/export");
    console.error("Error exporting variables:", error);
    return NextResponse.json(
      { error: "Failed to export variables" },
      { status: 500 }
    );
  }
}
