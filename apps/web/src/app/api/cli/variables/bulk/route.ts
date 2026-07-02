import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { handleApiError } from "@/lib/api-errors";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/cli-auth";
import { createSecret, readSecret } from "@/lib/vault";
import {
  isAuthorizationError,
  resolveLegacyRoles,
} from "../../_lib/legacy-roles";

interface BulkVariable {
  key: string;
  value: string;
  description?: string;
  isSensitive?: boolean;
}

/**
 * POST /api/cli/variables/bulk
 * Bulk create/update variables (for push command)
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  try {
    const body = await request.json();
    const { projectId, environment, variables, mode = "merge" } = body;

    if (!projectId || !environment || !variables || !Array.isArray(variables)) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, environment, variables" },
        { status: 400 }
      );
    }

    // Get project to find organization
    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check membership and role
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
      userId: authResult.userId,
    });

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    // Unified role model: owners/project managers/team leads AND assigned
    // developers all push directly. Developers may lack write grants on
    // variables created by others — each Convex mutation authorizes the
    // caller, and rejected operations are counted as skipped instead of
    // failing the whole push. Users without a project assignment are
    // blocked; grant-only users (per-variable viewer sharing) get the
    // strict read-only treatment old clients expect.
    const legacy = await resolveLegacyRoles(convex, {
      userId: authResult.userId,
      projectId: projectId as Id<"projects">,
      orgRole: membership.role,
    });

    if (!legacy.assigned) {
      if (legacy.grantOnly) {
        return forbiddenResponse(
          "You have Viewer access to this project. Push is not allowed."
        );
      }
      return forbiddenResponse(
        "You are not assigned to this project. Push is not allowed."
      );
    }

    // Get existing variables for this environment
    const existingVariables = await convex.query(api.variables.listByProject, {
      projectId: projectId as Id<"projects">,
      environment,
    });

    const existingByKey = new Map(existingVariables.map((v) => [v.key, v]));

    let created = 0;
    let updated = 0;
    let deleted = 0;
    let skipped = 0;

    // Process each variable
    for (const variable of variables as BulkVariable[]) {
      // Validate key format
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key)) {
        skipped++; // Skip invalid keys
        continue;
      }

      const existing = existingByKey.get(variable.key);

      try {
        if (existing) {
          // Update existing variable
          // First, get the current decrypted value to compare
          const currentValue = await readSecret(existing.vaultRef);

          if (currentValue !== variable.value) {
            // Value changed, update it. The Convex mutation authorizes the
            // caller (developers need a write grant on this variable).
            const vaultResult = await createSecret(
              variable.key,
              variable.value,
              {
                organizationId: project.organizationId,
                projectId: projectId,
              }
            );
            const vaultRef = vaultResult.id;

            await convex.mutation(api.variables.update, {
              variableId: existing._id,
              vaultRef,
              description: variable.description,
              isSensitive: variable.isSensitive,
              updatedBy: authResult.userId,
              changeReason: "Updated via CLI push",
            });

            updated++;
          }
        } else {
          // Create new variable
          const vaultResult = await createSecret(variable.key, variable.value, {
            organizationId: project.organizationId,
            projectId: projectId,
          });
          const vaultRef = vaultResult.id;

          await convex.mutation(api.variables.create, {
            key: variable.key,
            vaultRef,
            description: variable.description,
            environments: [environment],
            projectId: projectId as Id<"projects">,
            isSensitive: variable.isSensitive ?? false,
            createdBy: authResult.userId,
          });

          created++;
        }
      } catch (error) {
        // Variables the caller lacks write access to are skipped rather
        // than failing the whole push. Other errors still abort.
        if (!isAuthorizationError(error)) {
          throw error;
        }
        skipped++;
      }

      if (existing) {
        // Mark as processed (even when the update was skipped, so
        // replace-mode does not try to delete it afterwards)
        existingByKey.delete(variable.key);
      }
    }

    // If mode is 'replace', delete variables that weren't in the push
    if (mode === "replace") {
      for (const [_key, variable] of existingByKey) {
        try {
          await convex.mutation(api.variables.remove, {
            variableId: variable._id,
            deletedBy: authResult.userId,
          });
          deleted++;
        } catch (error) {
          if (!isAuthorizationError(error)) {
            throw error;
          }
          skipped++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        deleted,
        total: variables.length,
        // Additive field: only present when operations were skipped
        // (invalid keys or missing write access). Old clients ignore it.
        ...(skipped > 0 ? { skipped } : {}),
      },
    });
  } catch (error) {
    console.error("CLI bulk variables error:", error);
    return handleApiError(error, "Failed to bulk update variables");
  }
}
