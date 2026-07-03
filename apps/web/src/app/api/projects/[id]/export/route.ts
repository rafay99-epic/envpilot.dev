import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { createLogger } from "@/lib/logger";
import { readSecret } from "@/lib/vault";
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

const log = createLogger("api/projects/export");

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
    const { user } = await withAuth();
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

    // Get the project
    const project = await convex.query(api.projects.getById, {
      projectId: id as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get or create Convex user
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check org membership
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

    // Check bulk_export feature gate
    const featureCheck = await convex.query(api.featureRegistry.checkFeature, {
      organizationId: project.organizationId,
      featureKey: "bulk_export",
    });

    if (featureCheck && !featureCheck.allowed) {
      return NextResponse.json(
        {
          error: `Bulk export is not available on your current plan${featureCheck.tierName ? ` (${featureCheck.tierName})` : ""}. Upgrade to access this feature.`,
        },
        { status: 403 }
      );
    }

    // Get variables with access control
    const variables = await convex.query(api.variables.listWithAccess, {
      projectId: id as Id<"projects">,
      userId: convexUser._id,
    });

    // Filter by access and environment
    const accessible = variables
      .filter((v) => v.hasAccess)
      .filter((v) => !environment || v.environments.includes(environment));

    // Decrypt values
    const decrypted: Record<string, string> = {};
    for (const variable of accessible) {
      try {
        // vaultRef is only returned for entries with hasAccess (filtered above)
        const value = variable.vaultRef
          ? await readSecret(variable.vaultRef)
          : "";
        decrypted[variable.key] = value || "";
      } catch (decryptErr) {
        log.error(
          "variable_decrypt_failed",
          { variableId: variable._id, key: variable.key, projectId: id },
          decryptErr
        );
        decrypted[variable.key] = "[DECRYPTION_FAILED]";
      }
    }

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
    console.error("Error exporting variables:", error);
    return NextResponse.json(
      { error: "Failed to export variables" },
      { status: 500 }
    );
  }
}
