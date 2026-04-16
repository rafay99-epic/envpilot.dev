import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { checkOrganizationMembership } from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { clientIp, createLogger, isRateLimitError, since } from "@/lib/logger";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/extension/projects - List projects for the authenticated user
 */
export async function GET(request: Request) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");
  const log = createLogger("ext/projects", {
    ip: clientIp(request),
    organization_id: organizationId || "all",
  });

  log.debug("request_start");

  try {
    const authStart = Date.now();
    const auth = await authenticateExtensionRequest(request);
    log.debug("auth_complete", {
      duration_ms: since(authStart),
      authenticated: auth !== null,
    });

    if (!auth) {
      log.warn("unauthenticated", { duration_ms: since(start) });
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const convexUser = auth.convexUser;
    const childLog = log.child({
      convex_user_id: convexUser._id,
      email: convexUser.email,
    });

    if (organizationId) {
      const membership = await checkOrganizationMembership(
        convex,
        convexUser._id,
        organizationId as Id<"organizations">
      );

      if (!membership) {
        childLog.warn("forbidden_not_member", { duration_ms: since(start) });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const queryStart = Date.now();
      const projects = await convex.query(api.projects.listWithStats, {
        organizationId: organizationId as Id<"organizations">,
        userId: convexUser._id,
      });
      childLog.info("org_projects_returned", {
        count: projects.length,
        query_duration_ms: since(queryStart),
        duration_ms: since(start),
      });

      return NextResponse.json({
        data: {
          projects: projects.map((project) => ({
            _id: project._id,
            name: project.name,
            slug: project.slug,
            description: project.description || null,
            organizationId: project.organizationId,
            icon: project.icon || null,
            color: project.color || null,
            userRole: project.userRole ?? null,
            projectRole: project.projectRole ?? null,
          })),
        },
      });
    }

    const queryStart = Date.now();
    const userProjects = await convex.query(api.projects.listForUser, {
      userId: convexUser._id,
    });
    childLog.info("user_projects_returned", {
      count: userProjects.length,
      query_duration_ms: since(queryStart),
      duration_ms: since(start),
    });

    return NextResponse.json({
      data: {
        projects: userProjects.map(
          (project: {
            _id: string;
            name: string;
            slug: string;
            description?: string;
            organizationId: string;
            icon?: string;
            color?: string;
            userRole?: string;
            projectRole?: string | null;
          }) => ({
            _id: project._id,
            name: project.name,
            slug: project.slug,
            description: project.description || null,
            organizationId: project.organizationId,
            icon: project.icon || null,
            color: project.color || null,
            userRole: project.userRole ?? null,
            projectRole: project.projectRole ?? null,
          })
        ),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // THIS is the fix for the user's visible 429 on the Projects panel:
    // the endpoint used to swallow rate-limit errors as generic 500s, so
    // the real cause was invisible in logs. Now we surface it cleanly.
    if (isRateLimitError(error)) {
      log.warn("upstream_rate_limited", {
        error: message,
        duration_ms: since(start),
      });
      return NextResponse.json(
        {
          error:
            "Too many requests. The server is rate-limiting this endpoint — wait a minute and retry.",
        },
        { status: 429 }
      );
    }
    log.error(
      "unhandled_error",
      {
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: since(start),
      },
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
