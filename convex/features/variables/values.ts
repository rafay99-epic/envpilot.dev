import { v, ConvexError } from "convex/values";
import { action } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  legacyOrgRoleValidator,
  legacyProjectRoleValidator,
  orgRoleValidator,
} from "../../lib/roleCompat";
import { roleLevel, ROLE_LEVEL } from "../../lib/authz";

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
    unifiedRole: string;
    assigned: boolean;
    grantOnly: boolean;
    environmentScope: string[] | null;
    hasWriteAccess: boolean;
    scopeRestricted: boolean;
    decryptionFailures?: string[];
    autoUnsyncOnClose?: boolean;
    /** Resolved capability map — capability-aware clients prefer this. */
    capabilities: Record<string, boolean>;
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
 * (internal.features.vault.vault.*), and persists refs via the existing variable mutations.
 *
 * Why actions: only actions may perform the outbound WorkOS Vault fetch. Actions
 * have no ctx.db, so all DB access (authz, reads, writes) is delegated via
 * ctx.runQuery / ctx.runMutation, which propagate the caller's verified identity
 * to those functions.
 *
 * ZERO-DATA-LOSS: vaultRef strings are passed byte-for-byte between
 * internal.features.vault.vault.* and the variable mutations — never re-encoded. deleteSecret
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
      // Effective unsync-on-close for the caller (member override ??
      // project default ?? true; pro gate re-checked at read time).
      // Optional so older payload consumers stay valid.
      autoUnsyncOnClose: v.optional(v.boolean()),
      // Resolved capability map — capability-aware clients prefer this over
      // role-slug comparisons (custom registry roles).
      capabilities: v.record(v.string(), v.boolean()),
    }),
  }),
  handler: async (ctx, args): Promise<PullResult> => {
    const project = await ctx.runQuery(
      internal.features.projects.queries._getById,
      {
        projectId: args.projectId,
      }
    );
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.runQuery(
      api.features.organizations.queries.getMembership,
      {
        organizationId: project.organizationId,
      }
    );
    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const rows = await ctx.runQuery(
      api.features.variables.queries.listWithAccess,
      {
        projectId: args.projectId,
      }
    );
    const legacy = await ctx.runQuery(
      api.features.auth.queries.resolveLegacyRoles,
      {
        projectId: args.projectId,
      }
    );
    const autoUnsyncOnClose: boolean = await ctx.runQuery(
      api.features.projects.queries.resolveUnsyncOnClose,
      {
        projectId: args.projectId,
      }
    );

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
            value = await ctx.runAction(
              internal.features.vault.vault.readSecret,
              {
                vaultRef: r.vaultRef,
              }
            );
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
            ctx.runMutation(api.features.variables.mutations.logAccess, {
              variableId: entry._id as never,
              accessType: "export" as const,
              environment: environment || undefined,
            })
          )
      );
    }

    const roleHasBlanketWrite =
      legacy.capabilities["project.variables.update"] === true &&
      legacy.assigned;
    const hasWriteAccess =
      roleHasBlanketWrite ||
      variables.some((entry) => entry.access === "write");
    const scopeRestricted =
      legacy.capabilities["access.env_scoped"] === true &&
      legacy.assigned &&
      legacy.environmentScope !== null;

    return {
      variables,
      meta: {
        role: legacy.legacyRole,
        projectRole:
          legacy.legacyRole === "admin" ? null : legacy.legacyProjectRole,
        unifiedRole: legacy.role,
        assigned: legacy.assigned,
        grantOnly: legacy.grantOnly,
        environmentScope: legacy.environmentScope,
        hasWriteAccess,
        scopeRestricted,
        decryptionFailures:
          decryptionFailures.length > 0 ? decryptionFailures : undefined,
        autoUnsyncOnClose,
        capabilities: legacy.capabilities,
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
    rotationFrequencyDays: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("variableTags"))),
  },
  returns: v.object({ _id: v.id("environmentVariables") }),
  handler: async (ctx, args): Promise<{ _id: Id<"environmentVariables"> }> => {
    const project = await ctx.runQuery(
      internal.features.projects.queries._getById,
      {
        projectId: args.projectId,
      }
    );
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.runQuery(
      api.features.organizations.queries.getMembership,
      {
        organizationId: project.organizationId,
      }
    );
    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const legacy = await ctx.runQuery(
      api.features.auth.queries.resolveLegacyRoles,
      {
        projectId: args.projectId,
      }
    );
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

    // Reject environment clashes BEFORE writing the value to the vault — the
    // create mutation re-checks (race-safe backstop), but failing only there
    // left an orphaned vault secret behind for every clash. Same key across
    // DISJOINT environments is legal (per-environment uniqueness).
    const envClashes: string[] = await ctx.runQuery(
      internal.features.variables.queries.getEnvironmentConflictsInternal,
      {
        projectId: args.projectId,
        key: args.key,
        environments: args.environments,
      }
    );
    if (envClashes.length > 0) {
      throw new ConvexError(
        `Variable "${args.key}" already exists in environment(s): ${envClashes.join(", ")}. The same key is allowed only across non-overlapping environments.`
      );
    }

    const vault = await ctx.runAction(
      internal.features.vault.vault.createSecret,
      {
        name: args.key,
        value: args.value,
        organizationId: project.organizationId,
        projectId: args.projectId,
      }
    );

    let variableId: Id<"environmentVariables">;
    try {
      variableId = await ctx.runMutation(
        api.features.variables.mutations.create,
        {
          key: args.key,
          vaultRef: vault.id,
          description: args.description,
          environments: args.environments,
          projectId: args.projectId,
          isSensitive: args.isSensitive ?? false,
          rotationFrequencyDays: args.rotationFrequencyDays,
          tagIds: args.tagIds,
        }
      );
    } catch (error) {
      // The DB row never materialized — don't leave the secret orphaned.
      await ctx
        .runAction(internal.features.vault.vault.deleteSecret, {
          vaultRef: vault.id,
        })
        .catch(() => {});
      throw error;
    }

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

    const project = await ctx.runQuery(
      internal.features.projects.queries._getById,
      {
        projectId: args.projectId,
      }
    );
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.runQuery(
      api.features.organizations.queries.getMembership,
      {
        organizationId: project.organizationId,
      }
    );
    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const legacy = await ctx.runQuery(
      api.features.auth.queries.resolveLegacyRoles,
      {
        projectId: args.projectId,
      }
    );
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

    const existingVariables = await ctx.runQuery(
      api.features.variables.queries.listByProject,
      {
        projectId: args.projectId,
        environment: args.environment,
      }
    );
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
          const currentValue = await ctx.runAction(
            internal.features.vault.vault.readSecret,
            {
              vaultRef: existing.vaultRef,
            }
          );

          if (currentValue !== variable.value) {
            const vault = await ctx.runAction(
              internal.features.vault.vault.createSecret,
              {
                name: variable.key,
                value: variable.value,
                organizationId: project.organizationId,
                projectId: args.projectId,
              }
            );

            await ctx.runMutation(api.features.variables.mutations.update, {
              variableId: existing._id,
              vaultRef: vault.id,
              description: variable.description,
              isSensitive: variable.isSensitive,
              changeReason: "Updated via CLI push",
            });

            updated++;
          } else {
            // Value unchanged, but metadata may have changed — apply a
            // metadata-only update (no new vault version) so a push that only
            // edits the description / sensitivity isn't silently dropped. Only
            // fields the caller actually sent that differ are treated as changes.
            const descChanged =
              variable.description !== undefined &&
              variable.description !== existing.description;
            const sensChanged =
              variable.isSensitive !== undefined &&
              variable.isSensitive !== existing.isSensitive;
            if (descChanged || sensChanged) {
              await ctx.runMutation(api.features.variables.mutations.update, {
                variableId: existing._id,
                description: variable.description,
                isSensitive: variable.isSensitive,
                changeReason: "Updated via CLI push (metadata)",
              });
              updated++;
            }
          }
        } else {
          const vault = await ctx.runAction(
            internal.features.vault.vault.createSecret,
            {
              name: variable.key,
              value: variable.value,
              organizationId: project.organizationId,
              projectId: args.projectId,
            }
          );

          await ctx.runMutation(api.features.variables.mutations.create, {
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
          await ctx.runMutation(api.features.variables.mutations.remove, {
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

/**
 * Replaces the WorkOS Vault write path of PATCH /api/variables/[id].
 *
 * When a value is supplied, a NEW vault object is minted (the old ref stays
 * referenced by earlier variableVersions rows, which is what makes rollback
 * restore the previous value — never overwrite in place). The variable mutation
 * is the write-authorization authority; if it rejects, the freshly minted vault
 * object is referenced by nothing, so it is best-effort deleted to avoid a leak
 * — byte-for-byte the same orphan-cleanup ordering the route used.
 *
 * ZERO-DATA-LOSS: deleteSecret is only reached when the mutation threw (so no
 * Convex row ever points at the new ref); the existing ref is never touched.
 */
export const updateWithValue = action({
  args: {
    variableId: v.id("environmentVariables"),
    value: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
    isSensitive: v.optional(v.boolean()),
    changeReason: v.optional(v.string()),
    rotationFrequencyDays: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("variableTags"))),
  },
  returns: v.object({ _id: v.id("environmentVariables") }),
  handler: async (ctx, args): Promise<{ _id: Id<"environmentVariables"> }> => {
    // Fine-grained write authorization lives in the update mutation, but
    // don't let anonymous callers mint vault objects first: require a
    // verified identity before any vault write.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated: no verified user identity on request");
    }

    let vaultRef: string | undefined;

    // Mint a new vault object only when the value is actually changing. Needs
    // the variable's key + owning org for the key context — mirrors the route.
    if (args.value !== undefined) {
      const variable = await ctx.runQuery(
        api.features.variables.queries.getById,
        {
          variableId: args.variableId,
        }
      );
      if (!variable) {
        throw new Error("Variable not found");
      }
      const project = await ctx.runQuery(
        internal.features.projects.queries._getById,
        {
          projectId: variable.projectId,
        }
      );
      if (!project) {
        throw new Error("Project not found");
      }

      const vault = await ctx.runAction(
        internal.features.vault.vault.createSecret,
        {
          name: variable.key,
          value: args.value,
          organizationId: project.organizationId,
          projectId: variable.projectId,
        }
      );
      vaultRef = vault.id;
    }

    try {
      await ctx.runMutation(api.features.variables.mutations.update, {
        variableId: args.variableId,
        vaultRef,
        description: args.description,
        environments: args.environments,
        isSensitive: args.isSensitive,
        changeReason: args.changeReason,
        rotationFrequencyDays: args.rotationFrequencyDays,
        tagIds: args.tagIds,
      });
    } catch (mutationError) {
      // The mutation performs write authorization + validation. On rejection
      // the newly minted vault object is unreferenced and would leak forever.
      if (vaultRef) {
        try {
          await ctx.runAction(internal.features.vault.vault.deleteSecret, {
            vaultRef,
          });
        } catch {
          // Best-effort — vaultGc reconciles any straggler.
        }
      }
      throw mutationError;
    }

    return { _id: args.variableId };
  },
});

/**
 * Replaces the WorkOS Vault read path of GET /api/projects/[id]/export.
 *
 * Lists the caller's accessible, in-scope variables and decrypts each value.
 * Per-variable decrypt errors yield "[DECRYPTION_FAILED]" (never fail the whole
 * export). Returns key/value pairs; the route serializes them into the chosen
 * format. Authorization is enforced by listWithAccess (identity-verified — it
 * only returns a vaultRef for entries the caller may read).
 */
export const exportValues = action({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
  },
  returns: v.object({
    values: v.array(v.object({ key: v.string(), value: v.string() })),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ values: Array<{ key: string; value: string }> }> => {
    const rows = await ctx.runQuery(
      api.features.variables.queries.listWithAccess,
      {
        projectId: args.projectId,
      }
    );

    const environment = args.environment;
    const accessible = rows
      .filter((r) => r.hasAccess)
      .filter((r) => !environment || r.environments.includes(environment));

    const values: Array<{ key: string; value: string }> = [];
    for (const r of accessible) {
      let value = "";
      if (r.vaultRef) {
        try {
          value = await ctx.runAction(
            internal.features.vault.vault.readSecret,
            {
              vaultRef: r.vaultRef,
            }
          );
        } catch {
          value = DECRYPTION_FAILED;
        }
      }
      values.push({ key: r.key, value: value || "" });
    }

    return { values };
  },
});

/**
 * Replaces the WorkOS Vault write path of POST /api/projects/[id]/import.
 *
 * Two behaviours, chosen server-side from the caller's role (NOT a client flag,
 * so the decrypt-to-diff direct path can never be reached by a developer):
 *  - team_lead+ (canWriteDirectly): diff against existing values, re-encrypt +
 *    update changed keys, create new keys, and in replace-mode remove keys not
 *    present. Any mutation error aborts (mirrors the route).
 *  - developer: encrypt each proposed value and file a variable request; per-key
 *    errors are swallowed as skipped (mirrors the route).
 *
 * ZERO-DATA-LOSS: refs pass byte-for-byte to the mutations; removals go through
 * variables.remove (soft-delete only — no vault object is purged here).
 */
export const importValues = action({
  args: {
    projectId: v.id("projects"),
    environment: v.string(),
    mode: v.union(v.literal("merge"), v.literal("replace")),
    changeReason: v.optional(v.string()),
    entries: v.array(v.object({ key: v.string(), value: v.string() })),
  },
  returns: v.object({
    path: v.union(v.literal("direct"), v.literal("requests")),
    created: v.number(),
    updated: v.number(),
    deleted: v.number(),
    requested: v.number(),
    skipped: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    path: "direct" | "requests";
    created: number;
    updated: number;
    deleted: number;
    requested: number;
    skipped: number;
  }> => {
    const project = await ctx.runQuery(
      internal.features.projects.queries._getById,
      {
        projectId: args.projectId,
      }
    );
    if (!project) {
      throw new Error("Project not found");
    }

    const membership = await ctx.runQuery(
      api.features.organizations.queries.getMembership,
      {
        organizationId: project.organizationId,
      }
    );
    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    // Route by capability, not level: blanket-write roles import directly;
    // request-capable roles go through the request flow; everything else is
    // rejected before any vault write. Per-key enforcement still happens in
    // the mutations either way.
    const importLegacy = await ctx.runQuery(
      api.features.auth.queries.resolveLegacyRoles,
      { projectId: args.projectId }
    );
    // Capabilities come from the org-role profile and are NOT
    // assignment-aware — without this gate an unassigned team lead could
    // import into (and diff against) a project they cannot even see.
    // `assigned` is already true for roles that bypass assignment (owners).
    if (!importLegacy.assigned) {
      throw new ConvexError(
        "You do not have permission to import variables into this project."
      );
    }
    const canWriteDirectly =
      importLegacy.capabilities["project.variables.update"] === true;
    if (
      !canWriteDirectly &&
      importLegacy.capabilities["project.requests.submit"] !== true
    ) {
      throw new ConvexError(
        "You do not have permission to import variables into this project."
      );
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;
    let requested = 0;
    let skipped = 0;

    // Developer path: file a variable request per proposed key. Per-key errors
    // are swallowed (skipped), exactly like the route.
    if (!canWriteDirectly) {
      for (const entry of args.entries) {
        try {
          const vault = await ctx.runAction(
            internal.features.vault.vault.createSecret,
            {
              name: entry.key,
              value: entry.value,
              organizationId: project.organizationId,
              projectId: args.projectId,
            }
          );
          await ctx.runMutation(
            api.features.variables.requests.mutations.create,
            {
              key: entry.key,
              vaultRef: vault.id,
              environments: [args.environment],
              projectId: args.projectId,
              isSensitive: false,
            }
          );
          requested++;
        } catch {
          skipped++;
        }
      }
      return {
        path: "requests",
        created,
        updated,
        deleted,
        requested,
        skipped,
      };
    }

    // Direct path (team_lead+): diff against the environment's existing values.
    const existing = await ctx.runQuery(
      api.features.variables.queries.listByProject,
      {
        projectId: args.projectId,
        environment: args.environment,
      }
    );
    const existingByKey = new Map(existing.map((e) => [e.key, e]));

    for (const entry of args.entries) {
      const current = existingByKey.get(entry.key);
      if (current) {
        const currentValue = await ctx.runAction(
          internal.features.vault.vault.readSecret,
          {
            vaultRef: current.vaultRef,
          }
        );
        if (currentValue !== entry.value) {
          const vault = await ctx.runAction(
            internal.features.vault.vault.createSecret,
            {
              name: entry.key,
              value: entry.value,
              organizationId: project.organizationId,
              projectId: args.projectId,
            }
          );
          await ctx.runMutation(api.features.variables.mutations.update, {
            variableId: current._id,
            vaultRef: vault.id,
            changeReason: args.changeReason,
          });
          updated++;
        }
        existingByKey.delete(entry.key);
      } else {
        const vault = await ctx.runAction(
          internal.features.vault.vault.createSecret,
          {
            name: entry.key,
            value: entry.value,
            organizationId: project.organizationId,
            projectId: args.projectId,
          }
        );
        await ctx.runMutation(api.features.variables.mutations.create, {
          key: entry.key,
          vaultRef: vault.id,
          environments: [args.environment],
          projectId: args.projectId,
          isSensitive: false,
        });
        created++;
      }
    }

    if (args.mode === "replace") {
      for (const [, variable] of existingByKey) {
        await ctx.runMutation(api.features.variables.mutations.remove, {
          variableId: variable._id,
        });
        deleted++;
      }
    }

    return { path: "direct", created, updated, deleted, requested, skipped };
  },
});
