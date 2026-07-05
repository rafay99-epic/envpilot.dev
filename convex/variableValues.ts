import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  legacyOrgRoleValidator,
  legacyProjectRoleValidator,
  orgRoleValidator,
} from "./roleCompat";

// Explicit result types. Actions here call ctx.runQuery/runMutation/runAction
// on `api`/`internal`; annotating each handler's return type breaks the
// circular type inference that otherwise poisons this whole module (TS7022/23).
type PulledVariable = {
  _id: string;
  key: string;
  value: string;
  description?: string;
  environments: string[];
  projectId: string;
  isSensitive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  access: "read" | "write";
};

type PullResult = {
  variables: PulledVariable[];
  meta: {
    role: "admin" | "team_lead" | "member";
    projectRole: "manager" | "developer" | "viewer" | null;
    unifiedRole: "owner" | "project_manager" | "team_lead" | "developer";
    assigned: boolean;
    grantOnly: boolean;
    environmentScope: string[] | null;
    hasWriteAccess: boolean;
    scopeRestricted: boolean;
    decryptionFailures?: string[];
  };
};

type PushResult = {
  created: number;
  updated: number;
  deleted: number;
  total: number;
  skipped?: number;
  deniedKeys?: string[];
};

/**
 * Composed value read/write actions — Stage 3, Phase 2.
 *
 * These are the direct-to-Convex replacements for the surviving CLI/extension
 * vault HTTP routes (/api/cli/variables{,/bulk}, /api/cli/variable-requests,
 * /api/extension/variables). Secret VALUES now travel straight to Convex: each
 * action authenticates + authorizes (via runQuery to identity-verified queries),
 * then talks to WorkOS Vault through the internal vault primitive
 * (internal.vault.*), and persists refs via the existing variable mutations.
 *
 * Why actions: only actions may perform the outbound WorkOS Vault fetch. Actions
 * have no ctx.db, so all DB access (authz, reads, writes) is delegated via
 * ctx.runQuery / ctx.runMutation, which propagate the caller's verified identity
 * to those functions.
 *
 * ZERO-DATA-LOSS: vaultRef strings are passed byte-for-byte between
 * internal.vault.* and the variable mutations — never re-encoded. deleteSecret
 * semantics are honored by the mutations (soft-delete only), so no vault object
 * is ever orphaned.
 */

/**
 * True when a Convex mutation rejected the caller for authorization reasons
 * (e.g. a developer updating a variable they have no write grant on). Mirrors
 * the deleted route helper of the same name EXACTLY so per-key push failures are
 * classified identically (skipped/denied instead of aborting the whole push).
 */
function isAuthorizationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not authorized|insufficient permission|permission denied|forbidden|access is limited|no write (access|permission)/i.test(
    message
  );
}

const DECRYPTION_FAILED = "[DECRYPTION_FAILED]";

/**
 * Replaces GET /api/cli/variables AND GET /api/extension/variables.
 *
 * Lists the caller's accessible, in-scope variables with decrypted values
 * (skipped when metadataOnly), plus the legacy/unified role `meta` both routes
 * returned. Per-variable decrypt errors yield "[DECRYPTION_FAILED]" for that
 * variable (never fail the whole call) and are surfaced in meta.decryptionFailures.
 *
 * Shape note: this returns a canonical payload (each variable carries the full
 * `environments` array; meta carries both legacy and unified fields). The CLI's
 * listVariables() and the extension's getVariables() map it into the exact
 * shapes their commands already expect.
 */
export const pullValues = action({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
    metadataOnly: v.optional(v.boolean()),
  },
  returns: v.object({
    variables: v.array(
      v.object({
        _id: v.string(),
        key: v.string(),
        value: v.string(),
        description: v.optional(v.string()),
        environments: v.array(v.string()),
        projectId: v.string(),
        isSensitive: v.boolean(),
        version: v.number(),
        createdAt: v.number(),
        updatedAt: v.number(),
        access: v.union(v.literal("read"), v.literal("write")),
      })
    ),
    meta: v.object({
      role: legacyOrgRoleValidator,
      projectRole: legacyProjectRoleValidator,
      unifiedRole: orgRoleValidator,
      assigned: v.boolean(),
      grantOnly: v.boolean(),
      environmentScope: v.union(v.array(v.string()), v.null()),
      hasWriteAccess: v.boolean(),
      scopeRestricted: v.boolean(),
      decryptionFailures: v.optional(v.array(v.string())),
    }),
  }),
  handler: async (ctx, args): Promise<PullResult> => {
    const project = await ctx.runQuery(api.projects.getById, {
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.runQuery(api.organizations.getMembership, {
      organizationId: project.organizationId,
    });
    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const rows = await ctx.runQuery(api.variables.listWithAccess, {
      projectId: args.projectId,
    });
    const legacy = await ctx.runQuery(api.roleCompat.resolveLegacyRoles, {
      projectId: args.projectId,
    });

    const environment = args.environment;
    const accessible = rows
      .filter((r) => r.hasAccess)
      .filter((r) => !environment || r.environments.includes(environment));

    const decryptionFailures: string[] = [];
    const variables = [] as Array<{
      _id: string;
      key: string;
      value: string;
      description?: string;
      environments: string[];
      projectId: string;
      isSensitive: boolean;
      version: number;
      createdAt: number;
      updatedAt: number;
      access: "read" | "write";
    }>;

    for (const r of accessible) {
      let value = "";
      if (!args.metadataOnly) {
        if (!r.vaultRef) {
          decryptionFailures.push(r.key);
          value = DECRYPTION_FAILED;
        } else {
          try {
            value = await ctx.runAction(internal.vault.readSecret, {
              vaultRef: r.vaultRef,
            });
          } catch {
            decryptionFailures.push(r.key);
            value = DECRYPTION_FAILED;
          }
        }
      }

      variables.push({
        _id: r._id,
        key: r.key,
        value,
        description: r.description,
        environments: r.environments,
        projectId: r.projectId,
        isSensitive: r.isSensitive,
        version: r.version,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        // listWithAccess maps a caller's blanket write to "admin"; collapse
        // that to "write" (grant-only rows are already "read"/"write").
        access:
          r.permission === "admin"
            ? "write"
            : (r.permission as "read" | "write"),
      });
    }

    // Audit trail: log an "export" access for every variable whose value the
    // caller actually received. Awaited-but-swallowed (allSettled) so a logging
    // failure never breaks the fetch. Skipped entirely in metadataOnly mode.
    // (IP / user-agent are unavailable off the HTTP request and are omitted.)
    if (!args.metadataOnly) {
      await Promise.allSettled(
        variables
          .filter((entry) => entry.value !== DECRYPTION_FAILED)
          .map((entry) =>
            ctx.runMutation(api.variables.logAccess, {
              variableId: entry._id as never,
              accessType: "export" as const,
              environment: environment || undefined,
            })
          )
      );
    }

    const roleHasBlanketWrite =
      (legacy.role === "owner" ||
        legacy.role === "project_manager" ||
        legacy.role === "team_lead") &&
      legacy.assigned;
    const hasWriteAccess =
      roleHasBlanketWrite ||
      variables.some((entry) => entry.access === "write");
    const scopeRestricted =
      legacy.role === "developer" &&
      legacy.assigned &&
      legacy.environmentScope !== null;

    return {
      variables,
      meta: {
        role: legacy.legacyRole,
        projectRole: legacy.role === "owner" ? null : legacy.legacyProjectRole,
        unifiedRole: legacy.role,
        assigned: legacy.assigned,
        grantOnly: legacy.grantOnly,
        environmentScope: legacy.environmentScope,
        hasWriteAccess,
        scopeRestricted,
        decryptionFailures:
          decryptionFailures.length > 0 ? decryptionFailures : undefined,
      },
    };
  },
});

/**
 * Replaces POST /api/cli/variables (single create). Encrypts the value into
 * WorkOS Vault, then creates the variable with the returned ref. Authorization
 * mirrors the route: assigned developers+ may create; grant-only / unassigned
 * users are blocked (the create mutation is the final authorization authority).
 */
export const createWithValue = action({
  args: {
    projectId: v.id("projects"),
    key: v.string(),
    value: v.string(),
    environments: v.array(v.string()),
    isSensitive: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  returns: v.object({ _id: v.id("environmentVariables") }),
  handler: async (ctx, args): Promise<{ _id: Id<"environmentVariables"> }> => {
    const project = await ctx.runQuery(api.projects.getById, {
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.runQuery(api.organizations.getMembership, {
      organizationId: project.organizationId,
    });
    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const legacy = await ctx.runQuery(api.roleCompat.resolveLegacyRoles, {
      projectId: args.projectId,
    });
    if (!legacy.assigned) {
      if (legacy.grantOnly) {
        throw new Error(
          "You have Viewer access to this project. Variable creation is not allowed."
        );
      }
      throw new Error(
        "You are not assigned to this project. Variable creation is not allowed."
      );
    }

    const vault = await ctx.runAction(internal.vault.createSecret, {
      name: args.key,
      value: args.value,
      organizationId: project.organizationId,
      projectId: args.projectId,
    });

    const variableId = await ctx.runMutation(api.variables.create, {
      key: args.key,
      vaultRef: vault.id,
      description: args.description,
      environments: args.environments,
      projectId: args.projectId,
      isSensitive: args.isSensitive ?? false,
    });

    return { _id: variableId };
  },
});

/**
 * Replaces POST /api/cli/variables/bulk (push). Diffs the pushed variables
 * against the project's existing ones for the environment: reads each existing
 * value to compare, re-encrypts + updates only on change, creates new keys,
 * and in mode="replace" removes keys that were not pushed. Per-key authorization
 * failures (a developer without write on a specific variable) are counted as
 * skipped/denied instead of aborting the whole push — exactly like the route.
 */
export const pushBulk = action({
  args: {
    projectId: v.id("projects"),
    environment: v.string(),
    variables: v.array(
      v.object({
        key: v.string(),
        value: v.string(),
        description: v.optional(v.string()),
        isSensitive: v.optional(v.boolean()),
      })
    ),
    mode: v.optional(v.union(v.literal("merge"), v.literal("replace"))),
  },
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    deleted: v.number(),
    total: v.number(),
    skipped: v.optional(v.number()),
    deniedKeys: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args): Promise<PushResult> => {
    const mode = args.mode ?? "merge";

    const project = await ctx.runQuery(api.projects.getById, {
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.runQuery(api.organizations.getMembership, {
      organizationId: project.organizationId,
    });
    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const legacy = await ctx.runQuery(api.roleCompat.resolveLegacyRoles, {
      projectId: args.projectId,
    });
    if (!legacy.assigned) {
      if (legacy.grantOnly) {
        throw new Error(
          "You have Viewer access to this project. Push is not allowed."
        );
      }
      throw new Error(
        "You are not assigned to this project. Push is not allowed."
      );
    }

    const existingVariables = await ctx.runQuery(api.variables.listByProject, {
      projectId: args.projectId,
      environment: args.environment,
    });
    const existingByKey = new Map(existingVariables.map((v2) => [v2.key, v2]));

    let created = 0;
    let updated = 0;
    let deleted = 0;
    let skipped = 0;
    const deniedKeys: string[] = [];

    for (const variable of args.variables) {
      // Validate key format (invalid keys are skipped, not denied).
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key)) {
        skipped++;
        continue;
      }

      const existing = existingByKey.get(variable.key);

      try {
        if (existing) {
          // Compare against the current decrypted value; only touch vault +
          // Convex when the value actually changed.
          const currentValue = await ctx.runAction(internal.vault.readSecret, {
            vaultRef: existing.vaultRef,
          });

          if (currentValue !== variable.value) {
            const vault = await ctx.runAction(internal.vault.createSecret, {
              name: variable.key,
              value: variable.value,
              organizationId: project.organizationId,
              projectId: args.projectId,
            });

            await ctx.runMutation(api.variables.update, {
              variableId: existing._id,
              vaultRef: vault.id,
              description: variable.description,
              isSensitive: variable.isSensitive,
              changeReason: "Updated via CLI push",
            });

            updated++;
          }
        } else {
          const vault = await ctx.runAction(internal.vault.createSecret, {
            name: variable.key,
            value: variable.value,
            organizationId: project.organizationId,
            projectId: args.projectId,
          });

          await ctx.runMutation(api.variables.create, {
            key: variable.key,
            vaultRef: vault.id,
            description: variable.description,
            environments: [args.environment],
            projectId: args.projectId,
            isSensitive: variable.isSensitive ?? false,
          });

          created++;
        }
      } catch (error) {
        // Variables the caller lacks write access to are skipped rather than
        // failing the whole push. Other errors still abort.
        if (!isAuthorizationError(error)) {
          throw error;
        }
        skipped++;
        deniedKeys.push(variable.key);
      }

      if (existing) {
        // Mark processed so replace-mode does not try to delete it afterwards.
        existingByKey.delete(variable.key);
      }
    }

    if (mode === "replace") {
      for (const [key, variable] of existingByKey) {
        try {
          await ctx.runMutation(api.variables.remove, {
            variableId: variable._id,
          });
          deleted++;
        } catch (error) {
          if (!isAuthorizationError(error)) {
            throw error;
          }
          skipped++;
          deniedKeys.push(key);
        }
      }
    }

    return {
      created,
      updated,
      deleted,
      total: args.variables.length,
      ...(skipped > 0 ? { skipped } : {}),
      ...(deniedKeys.length > 0 ? { deniedKeys } : {}),
    };
  },
});
