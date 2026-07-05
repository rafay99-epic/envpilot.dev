import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getProjectOrganization } from "@/lib/convex-helpers";
import { requireWorkosUser } from "@/lib/cli-auth";
import { createLogger } from "@/lib/logger";
import { toLegacyOrgRole } from "@/lib/roles";
import { readSecret } from "@/lib/vault";
import { resolveLegacyRoles } from "../_lib/legacy-roles";

const log = createLogger("api/extension/variables");

/**
 * GET /api/extension/variables - List variables for a project (with decrypted
 * values).
 *
 * Since the Stage 2 device-flow cutover this route has ONE auth plane: a
 * WorkOS AuthKit JWT in the Authorization header (the extension's device-flow
 * token). Identity is verified against WorkOS's JWKS and re-derived inside
 * every Convex call via the setAuth'd client — the old projectAccess
 * X-Access-Token and cliTokens bearer planes are gone. This route survives
 * only because vault decryption is server-side until Stage 3.
 */
export async function GET(request: Request) {
  try {
    // Verify the JWT bearer AND confirm a provisioned Convex user, so an
    // unprovisioned-but-valid token returns 401 instead of a 500 from the
    // first identity-resolving Convex query.
    const auth = await requireWorkosUser(request, convex);
    if (!auth.ok) return auth.response;
    const authed = createAuthedConvexClient(auth.token);

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const environment = searchParams.get("environment") || "development";
    const metadataOnly = searchParams.get("metadataOnly") === "true";

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Membership check runs as the caller (identity from the verified JWT).
    const membership = await authed.query(api.organizations.getMembership, {
      organizationId,
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userRole = membership.role || "member";

    // Get only variables this user can access — identity re-derived inside.
    const variablesWithAccess = await authed.query(
      api.variables.listWithAccess,
      { projectId: projectId as Id<"projects"> }
    );

    const variables = variablesWithAccess
      .filter((variable) => variable.hasAccess)
      .filter((variable) => variable.environments.includes(environment));

    // Translate the unified role model into the legacy strings old extension
    // builds derive .env file protection from. Owners get projectRole null
    // exactly like legacy admins did; grant-only users (per-variable viewer
    // sharing, no assignment) get "viewer" so files stay strictly read-only.
    const legacy = await resolveLegacyRoles(authed, {
      projectId: projectId as Id<"projects">,
      orgRole: userRole,
    });

    // Additive unified-model meta for new extension builds. Old extension
    // builds read only `role` and ignore these keys.
    const roleHasBlanketWrite =
      (legacy.role === "owner" ||
        legacy.role === "project_manager" ||
        legacy.role === "team_lead") &&
      legacy.assigned;
    const hasWriteAccess =
      roleHasBlanketWrite ||
      variables.some(
        (v) => v.permission === "write" || v.permission === "admin"
      );
    const scopeRestricted =
      legacy.role === "developer" &&
      legacy.assigned &&
      legacy.environmentScope !== null;

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
            // Additive: per-variable unified access. listWithAccess maps a
            // caller's blanket write to "admin"; collapse that to "write".
            access: (variable.permission === "admin"
              ? "write"
              : variable.permission) as "read" | "write",
          })),
          // Old extension builds only understand the legacy role strings.
          role: toLegacyOrgRole(userRole),
          // Additive unified-model fields:
          unifiedRole: legacy.role,
          assigned: legacy.assigned,
          grantOnly: legacy.grantOnly,
          environmentScope: legacy.environmentScope,
          hasWriteAccess,
          scopeRestricted,
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
            // Additive: per-variable unified access. listWithAccess maps a
            // caller's blanket write to "admin"; collapse that to "write".
            access: (variable.permission === "admin"
              ? "write"
              : variable.permission) as "read" | "write",
          };
        } catch (decryptErr) {
          log.error(
            "variable_decrypt_failed",
            { variableId: variable._id, key: variable.key, projectId },
            decryptErr
          );
          return {
            _id: variable._id,
            key: variable.key,
            value: "[DECRYPTION_FAILED]",
            description: variable.description || null,
            environments: variable.environments,
            projectId: variable.projectId,
            isSensitive: variable.isSensitive,
            version: variable.version,
            access: (variable.permission === "admin"
              ? "write"
              : variable.permission) as "read" | "write",
          };
        }
      })
    );

    // Fire-and-forget: log access for the audit trail (non-blocking).
    // Identity is re-derived from the JWT inside the mutation.
    Promise.allSettled(
      variablesWithValues
        .filter((v) => v.value !== "[DECRYPTION_FAILED]")
        .map((v) =>
          authed.mutation(api.variables.logAccess, {
            variableId: v._id as Id<"environmentVariables">,
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
        // Additive unified-model fields:
        unifiedRole: legacy.role,
        assigned: legacy.assigned,
        grantOnly: legacy.grantOnly,
        environmentScope: legacy.environmentScope,
        hasWriteAccess,
        scopeRestricted,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch variables";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
