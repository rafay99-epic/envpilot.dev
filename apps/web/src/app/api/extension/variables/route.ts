import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { toLegacyOrgRole } from "@/lib/roles";
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
    const metadataOnly = searchParams.get("metadataOnly") === "true";
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

    // Metadata-only mode: no vault decryption and no "export" audit events.
    // Used by extension UI surfaces (tree view, dashboard) that display
    // names and metadata but never values.
    if (metadataOnly) {
      return NextResponse.json({
        data: {
          variables: variables.map((variable) => ({
            _id: variable._id,
            key: variable.key,
            value: "",
            description: variable.description || null,
            environments: variable.environments,
            projectId: variable.projectId,
            isSensitive: variable.isSensitive,
            version: variable.version,
          })),
          // Old extension builds only understand the legacy role strings.
          role: toLegacyOrgRole(userRole),
        },
      });
    }

    const variablesWithValues = await Promise.all(
      variables.map(async (variable) => {
        try {
          // listWithAccess only includes vaultRef when hasAccess is true;
          // the filter above guarantees it, but narrow the type explicitly.
          if (!variable.vaultRef) {
            throw new Error("Missing vault reference");
          }
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

    // Fire-and-forget: log access for the audit trail (non-blocking)
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
        // Old extension builds only understand the legacy role strings.
        role: toLegacyOrgRole(userRole),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch variables";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
