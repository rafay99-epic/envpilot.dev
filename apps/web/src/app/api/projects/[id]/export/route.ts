import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { readSecret } from "@/lib/vault";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/export - Export environment variables as .env or .json
 *
 * Query params:
 *   environment - "development" | "staging" | "production" (optional, default: all)
 *   format - "env" | "json" (optional, default: "env")
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
    const format = url.searchParams.get("format") || "env";

    if (format !== "env" && format !== "json") {
      return NextResponse.json(
        { error: "Format must be 'env' or 'json'" },
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
    const decrypted: { key: string; value: string }[] = [];
    for (const variable of accessible) {
      try {
        const value = await readSecret(variable.vaultRef);
        decrypted.push({ key: variable.key, value: value || "" });
      } catch {
        decrypted.push({ key: variable.key, value: "[DECRYPTION_FAILED]" });
      }
    }

    const filename = `${environment || "all"}.${format}`;

    if (format === "json") {
      const jsonBody: Record<string, string> = {};
      for (const { key, value } of decrypted) {
        jsonBody[key] = value;
      }

      return new NextResponse(JSON.stringify(jsonBody, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // .env format
    const lines: string[] = [];
    lines.push(`# Environment: ${environment || "all"}`);
    lines.push(`# Project: ${project.name}`);
    lines.push(`# Exported: ${new Date().toISOString()}`);
    lines.push("");

    for (const { key, value } of decrypted) {
      lines.push(`${key}=${value}`);
    }

    const body = lines.join("\n") + "\n";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
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
