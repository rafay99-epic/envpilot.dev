import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { readSecret } from "@/lib/vault";

/**
 * GET /api/extension/variables - List variables for a project (with decrypted values)
 *
 * Requires either:
 * - A valid access token (X-Access-Token header)
 * - Or authenticated session with project access
 */
export async function GET(request: Request) {
  try {
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const environment = searchParams.get("environment") || "development";
    const accessToken = request.headers.get("X-Access-Token");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    let authorizedUserId: Id<"users">;
    let userRole: string = "member";

    // Validate access token if provided
    if (accessToken) {
      const validation = await convex.query(api.projectAccess.validateToken, {
        accessToken,
      });

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.reason || "Invalid access token" },
          { status: 401 }
        );
      }

      if (validation.projectId !== projectId) {
        return NextResponse.json(
          { error: "Access token does not match project" },
          { status: 403 }
        );
      }

      authorizedUserId = validation.userId as Id<"users">;

      // Resolve user role from project's organization
      const { organizationId: projOrgId } = await getProjectOrganization(
        convex,
        projectId as Id<"projects">
      );
      if (projOrgId) {
        const tokenMembership = await checkOrganizationMembership(
          convex,
          authorizedUserId,
          projOrgId
        );
        if (tokenMembership) {
          userRole = tokenMembership.role || "member";
        }
      }

      // Update last used
      await convex.mutation(api.projectAccess.updateLastUsed, { accessToken });
    } else {
      // Fall back to Bearer token or session authentication
      const auth = await authenticateExtensionRequest(request);

      if (!auth) {
        return NextResponse.json(
          { error: "Not authenticated" },
          { status: 401 }
        );
      }

      const convexUser = auth.convexUser;

      // Verify project access
      const { project, organizationId } = await getProjectOrganization(
        convex,
        projectId as Id<"projects">
      );

      if (!project || !organizationId) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      const membership = await checkOrganizationMembership(
        convex,
        convexUser._id,
        organizationId
      );

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      userRole = membership.role || "member";
      authorizedUserId = convexUser._id;
    }

    // Get only variables this user can access.
    const variablesWithAccess = await convex.query(
      api.variables.listWithAccess,
      {
        projectId: projectId as Id<"projects">,
        userId: authorizedUserId,
      }
    );

    const variables = variablesWithAccess
      .filter((variable) => variable.hasAccess)
      .filter((variable) => variable.environments.includes(environment));

    const variablesWithValues = await Promise.all(
      variables.map(async (variable) => {
        try {
          const value = await readSecret(variable.vaultRef);
          return {
            _id: variable._id,
            key: variable.key,
            value: value || "",
            description: variable.description || null,
            environments: variable.environments,
            projectId: variable.projectId,
            isSensitive: variable.isSensitive,
            version: variable.version,
          };
        } catch {
          return {
            _id: variable._id,
            key: variable.key,
            value: "[DECRYPTION_FAILED]",
            description: variable.description || null,
            environments: variable.environments,
            projectId: variable.projectId,
            isSensitive: variable.isSensitive,
            version: variable.version,
          };
        }
      })
    );

    // Fire-and-forget: log access for anomaly detection (non-blocking)
    Promise.allSettled(
      variablesWithValues
        .filter((v) => v.value !== "[DECRYPTION_FAILED]")
        .map((v) =>
          convex.mutation(api.variables.logAccess, {
            variableId: v._id as Id<"environmentVariables">,
            accessedBy: authorizedUserId,
            accessType: "export" as const,
            ipAddress,
            userAgent,
            environment,
          })
        )
    ).catch(() => {
      // Swallow errors — audit logging must never break variable fetch
    });

    return NextResponse.json({
      data: {
        variables: variablesWithValues,
        role: userRole,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch variables";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
