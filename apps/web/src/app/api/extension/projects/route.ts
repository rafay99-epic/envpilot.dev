import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { checkOrganizationMembershipForToken } from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { clientIp, createLogger, isRateLimitError, since } from "@/lib/logger";
import {
  normalizeOrgRole,
  toLegacyOrgRole,
  toLegacyProjectRole,
} from "@/lib/roles";

// Old extension builds only understand the legacy role strings and derive
// .env file protection from them. Non-owners only receive projects they are
// assigned to, so assignment is implied; owners get projectRole null exactly
// like legacy admins did (their org role already grants write access).
function legacyRolesForProject(orgRole: string | null | undefined): {
  userRole: string;
  projectRole: string | null;
} {
  return {
    userRole: toLegacyOrgRole(orgRole),
    projectRole:
      normalizeOrgRole(orgRole) === "owner"
        ? null
        : toLegacyProjectRole(orgRole, true),
  };
}

/**
 * Additive unified-model fields for new extension builds. Owners are
 * implicitly assigned to every project (no scope). For non-owners we look up
 * the real projectMembers row per project to confirm assignment and read a
 * developer's environment scope — this route used to hardcode
 * `assigned: true` for every non-owner, which was wrong for grant-only
 * viewers with no project assignment.
 */
async function resolveUnifiedProjectFields(
  accessToken: string,
  projectId: Id<"projects">,
  orgRole: string | null | undefined
): Promise<{
  unifiedRole: ReturnType<typeof normalizeOrgRole>;
  assigned: boolean;
  environmentScope: string[] | null;
}> {
  const unifiedRole = normalizeOrgRole(orgRole);
  if (unifiedRole === "owner") {
    return { unifiedRole, assigned: true, environmentScope: null };
  }
  const projectMembership = await convex.query(
    api.projectMembers.getProjectMembershipForToken,
    { accessToken, projectId }
  );
  return {
    unifiedRole,
    assigned: projectMembership !== null,
    environmentScope:
      unifiedRole === "developer"
        ? (projectMembership?.environments ?? null)
        : null,
  };
}

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
      const membership = await checkOrganizationMembershipForToken(
        convex,
        auth.accessToken!,
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

      // Additive unified-model fields per project (see
      // resolveUnifiedProjectFields doc comment).
      const unifiedByProject = new Map(
        await Promise.all(
          projects.map(
            async (project) =>
              [
                project._id,
                await resolveUnifiedProjectFields(
                  auth.accessToken!,
                  project._id as Id<"projects">,
                  membership.role
                ),
              ] as const
          )
        )
      );

      return NextResponse.json({
        data: {
          projects: projects.map((project) => {
            const unified = unifiedByProject.get(project._id);
            return {
              _id: project._id,
              name: project.name,
              slug: project.slug,
              description: project.description || null,
              organizationId: project.organizationId,
              icon: project.icon || null,
              color: project.color || null,
              ...legacyRolesForProject(membership.role),
              // Additive unified-model fields for new extension builds. Old
              // extension builds ignore them.
              unifiedRole:
                unified?.unifiedRole ?? normalizeOrgRole(membership.role),
              assigned: unified?.assigned ?? false,
              environmentScope: unified?.environmentScope ?? null,
            };
          }),
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

    // Additive unified-model fields per project (see
    // resolveUnifiedProjectFields doc comment).
    const unifiedByUserProject = new Map(
      await Promise.all(
        userProjects.map(
          async (project: { _id: string; userRole?: string }) =>
            [
              project._id,
              await resolveUnifiedProjectFields(
                auth.accessToken!,
                project._id as Id<"projects">,
                project.userRole
              ),
            ] as const
        )
      )
    );

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
          }) => {
            const unified = unifiedByUserProject.get(project._id);
            return {
              _id: project._id,
              name: project.name,
              slug: project.slug,
              description: project.description || null,
              organizationId: project.organizationId,
              icon: project.icon || null,
              color: project.color || null,
              ...legacyRolesForProject(project.userRole),
              // Additive unified-model fields for new extension builds. Old
              // extension builds ignore them.
              unifiedRole:
                unified?.unifiedRole ?? normalizeOrgRole(project.userRole),
              assigned: unified?.assigned ?? false,
              environmentScope: unified?.environmentScope ?? null,
            };
          }
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
