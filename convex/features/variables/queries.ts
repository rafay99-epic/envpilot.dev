import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, internalQuery, type QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { authorizeVariableAccess } from "../../lib/authHelpers";
import { PURGE_RETENTION_DAYS } from "../vault/gc";
import {
  getVariableAccess,
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  toLegacyProjectRole,
  getActiveMembership,
  isSuspendedMembership,
  getRoleProfile,
  bypassesAssignment,
  hasCapability,
  profileToLegacyProjectRole,
} from "../../lib/authz";
import {
  buildActiveGrantMap,
  mapVariableRow,
  resolveProjectAccessContext,
  findEnvironmentConflicts,
} from "./helpers";

/**
 * Environment Variable Queries
 */

// ==========================================
// QUERIES
// ==========================================

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const allVariables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(args.limit ?? 500);
    const variables = allVariables.filter(
      (variable) => variable.deletedAt === undefined
    );

    if (args.environment) {
      return variables.filter((v) =>
        v.environments.includes(args.environment!)
      );
    }

    return variables;
  },
});

/**
 * Access-aware org-wide variable listing for the global Variables page.
 *
 * Enumerates only the projects the caller can see (owner → all; everyone
 * else → assigned projects), applies environment scope for developers, and
 * returns vaultRef ONLY for variables the caller can actually access.
 * Variables the caller has no access to are omitted entirely — the page
 * shows keys/metadata only for what they may touch.
 *
 * Row shape is the variable's fields plus projectName/projectSlug and a
 * `hasAccess`/`permission` pair, so the page's filtering/search keeps
 * working. vaultRef is present only when hasAccess.
 *
 * (This used to have an org-wide, access-unfiltered sibling —
 * `listByOrganization` — that duplicated this query without the access
 * filtering or vaultRef trimming. It had no live callers and was removed as
 * dead code; this query has always been the correct one to use.)
 */
export const listOrgVariablesWithAccess = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    // Resolve the caller's org role — non-members (and suspended members) get
    // nothing.
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return [];

    const orgRole = normalizeOrgRole(membership.role);
    const profile = await getRoleProfile(ctx, orgRole);
    const isOwner = bypassesAssignment(profile);

    // Determine accessible projects and (for scoped roles) their env scope.
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const liveProjects = allProjects.filter((p) => p.deletedAt === undefined);

    // Env scope per assigned project (only constrains developers).
    const scopeByProject = new Map<string, string[] | undefined>();
    const assignedProjectIds = new Set<string>();
    if (!isOwner) {
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect();
      for (const pm of assignments) {
        assignedProjectIds.add(pm.projectId as string);
        scopeByProject.set(pm.projectId as string, pm.environments);
      }
    }

    const accessibleProjects = isOwner
      ? liveProjects
      : liveProjects.filter((p) => assignedProjectIds.has(p._id as string));

    // Owners and assigned PMs/TLs have blanket write; developers depend on
    // per-variable grants (resolved below).
    const roleWrite =
      isOwner || hasCapability(profile, "project.variables.update");
    const roleRead = hasCapability(profile, "access.blanket_read");

    // Prefetch the caller's active grants ONCE (only developers consult them,
    // but a single indexed query is far cheaper than one per variable).
    const grantByVariable = buildActiveGrantMap(
      await ctx.db
        .query("variablePermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", actor._id).eq("isActive", true)
        )
        .collect()
    );

    const perProjectLimit = args.limit ?? 500;

    const results: Array<
      Omit<Doc<"environmentVariables">, "vaultRef"> & {
        vaultRef?: string;
        projectName: string;
        projectSlug: string;
        hasAccess: boolean;
        permission: "write" | "read" | null;
      }
    > = [];

    for (const project of accessibleProjects) {
      const environmentScope = hasCapability(profile, "access.env_scoped")
        ? scopeByProject.get(project._id as string)
        : undefined;

      const allVariables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", project._id).eq("deletedAt", undefined)
        )
        .take(perProjectLimit);

      // Scoped developers never receive out-of-scope variables at all.
      const variables = allVariables.filter(
        (variable) =>
          variable.deletedAt === undefined &&
          isEnvironmentScopeAllowed(environmentScope, variable.environments)
      );

      for (const variable of variables) {
        let access: "write" | "read" | null = null;
        if (roleWrite) {
          access = "write";
        } else if (roleRead) {
          // Auditor class — blanket read, no grants involved
          access = "read";
        } else {
          // Grant-fallback roles — resolve from the prefetched map
          const grant = grantByVariable.get(variable._id as string) ?? null;
          if (grant) {
            access =
              grant.permission === "read"
                ? "read"
                : hasCapability(profile, "access.grant_fallback")
                  ? "write"
                  : "read";
          }
        }

        const hasAccess = access !== null;
        // Developers only ever see variables they can access; owners/PMs/TLs
        // see everything in their accessible projects (with write access).
        if (!hasAccess) continue;

        const { vaultRef, ...metadata } = variable;
        results.push({
          ...metadata,
          vaultRef,
          projectName: project.name,
          projectSlug: project.slug,
          hasAccess,
          permission: access,
        });
      }
    }

    return results;
  },
});

/**
 * Cross-project, cursor-paginated variant of listOrgVariablesWithAccess for the
 * global variables page. Paginates variables across ALL of a caller's accessible
 * projects using a COMPOSITE cursor, without any schema change (no org index on
 * environmentVariables) and without depending on any data migration.
 *
 * Access resolution mirrors listOrgVariablesWithAccess (owner → all live org
 * projects; else assigned projects via projectMembers; developer env-scope;
 * per-variable grant via the prefetched by_user_active map). Non-accessible
 * variables are skipped entirely, exactly like the non-paginated sibling.
 *
 * COMPOSITE CURSOR FORMAT: JSON.stringify({ pi, ic }) where
 *   - pi = index into the deterministically ordered accessibleProjects list
 *   - ic = the inner per-project Convex cursor (string) or null to start a project
 * Empty string ("") means the stream is exhausted (isDone). Because pi indexes a
 * snapshot-ordered project list (stable sort by _id), adding/removing projects
 * between calls can shift the index — the same limitation as any snapshot
 * pagination; it is accepted here rather than encoding ids in the cursor.
 */
export const listOrgVariablesWithAccessPaginated = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const empty = { page: [], isDone: true, continueCursor: "" };

    // Resolve the caller's org role — non-members (and suspended members) get
    // nothing.
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return empty;

    const orgRole = normalizeOrgRole(membership.role);
    const profile = await getRoleProfile(ctx, orgRole);
    const isOwner = bypassesAssignment(profile);

    // Determine accessible projects and (for scoped roles) their env scope.
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const liveProjects = allProjects.filter((p) => p.deletedAt === undefined);

    // Env scope per assigned project (only constrains developers).
    const scopeByProject = new Map<string, string[] | undefined>();
    const assignedProjectIds = new Set<string>();
    if (!isOwner) {
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect();
      for (const pm of assignments) {
        assignedProjectIds.add(pm.projectId as string);
        scopeByProject.set(pm.projectId as string, pm.environments);
      }
    }

    // Deterministic, stable order so the cursor's pi points at the same project
    // on every call: sort by _id string.
    const accessibleProjects = (
      isOwner
        ? liveProjects
        : liveProjects.filter((p) => assignedProjectIds.has(p._id as string))
    )
      .slice()
      .sort((a, b) => {
        const ai = a._id as string;
        const bi = b._id as string;
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      });

    // For a non-owner, every accessible project is an assigned project (the list
    // above is filtered to assignedProjectIds). Owners are never "assigned".
    const assigned = !isOwner;
    const roleAccess =
      isOwner ||
      (assigned && hasCapability(profile, "project.variables.update"));
    const roleRead = assigned && hasCapability(profile, "access.blanket_read");
    const canManagePermissions =
      isOwner ||
      (assigned && hasCapability(profile, "project.permissions.manage"));
    const projectRole = profileToLegacyProjectRole(profile, assigned);

    // Prefetch the caller's active grants ONCE (only developers consult them).
    const grantByVariable = buildActiveGrantMap(
      await ctx.db
        .query("variablePermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", actor._id).eq("isActive", true)
        )
        .collect()
    );

    type Row = Omit<Doc<"environmentVariables">, "vaultRef"> & {
      vaultRef?: string;
      hasAccess: boolean;
      permission: "admin" | "write" | "read" | null;
      roleAccess: boolean;
      userRole: typeof orgRole;
      projectRole: typeof projectRole;
      canManagePermissions: boolean;
      projectName: string;
      projectSlug: string;
    };

    const numItems = args.paginationOpts.numItems;
    const page: Row[] = [];

    // Parse the incoming composite cursor. Defensive: any malformed cursor or
    // out-of-range pi is treated as an exhausted stream.
    let pi = 0;
    let ic: string | null = null;
    const rawCursor = args.paginationOpts.cursor;
    if (rawCursor) {
      try {
        const parsed = JSON.parse(rawCursor) as {
          pi?: unknown;
          ic?: unknown;
        };
        if (typeof parsed.pi === "number" && parsed.pi >= 0) {
          pi = parsed.pi;
          ic = typeof parsed.ic === "string" ? parsed.ic : null;
        } else {
          pi = accessibleProjects.length;
        }
      } catch (err) {
        console.error("variables.listPaginated.parseCursorFailed", {
          field: "paginationOpts.cursor",
          organizationId: args.organizationId,
          userId: actor._id,
          error: String(err),
        });
        pi = accessibleProjects.length;
      }
    }

    // Convex allows only ONE `.paginate()` per query execution, so we paginate
    // exactly one project per call. When the current project is exhausted the
    // returned cursor points at the NEXT project (isDone stays false), and
    // usePaginatedQuery calls again — walking project by project. Pages may be
    // smaller than numItems (or empty) after access filtering; that is expected
    // and the cursor always advances, so there is no empty-page stall.
    let isDone = false;
    let continueCursor = "";

    if (pi >= accessibleProjects.length) {
      // Cursor already past the last project — nothing left.
      isDone = true;
    } else {
      const project = accessibleProjects[pi];
      const environmentScope = hasCapability(profile, "access.env_scoped")
        ? scopeByProject.get(project._id as string)
        : undefined;

      const inner = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", project._id).eq("deletedAt", undefined)
        )
        .order("desc")
        .paginate({ numItems, cursor: ic });

      for (const variable of inner.page) {
        // Scoped developers never receive out-of-scope variables at all.
        if (variable.deletedAt !== undefined) continue;
        if (!isEnvironmentScopeAllowed(environmentScope, variable.environments))
          continue;

        // Mirrors listOrgVariablesWithAccess: owner/PM/TL → write; developers
        // per grant; unassigned grant holders capped at read.
        const grant = grantByVariable.get(variable._id as string) ?? null;
        let access: "write" | "read" | null = null;
        if (roleAccess) {
          access = "write";
        } else if (roleRead) {
          access = "read";
        } else if (grant) {
          access =
            !assigned || grant.permission === "read"
              ? "read"
              : hasCapability(profile, "access.grant_fallback")
                ? "write"
                : "read";
        }

        // Not accessible → skip entirely (identical to the non-paginated list).
        if (access === null) continue;

        const effectivePermission = canManagePermissions ? "admin" : access;
        const { vaultRef, ...metadata } = variable;
        page.push({
          ...metadata,
          // Only accessible rows reach here, so the vault ref is always kept.
          vaultRef,
          hasAccess: true,
          permission: effectivePermission,
          roleAccess,
          userRole: orgRole,
          projectRole,
          canManagePermissions,
          projectName: project.name,
          projectSlug: project.slug,
        });
      }

      if (inner.isDone) {
        // Current project exhausted — resume at the next project next call.
        const nextPi = pi + 1;
        isDone = nextPi >= accessibleProjects.length;
        continueCursor = isDone ? "" : JSON.stringify({ pi: nextPi, ic: null });
      } else {
        // More variables remain in this project — resume from its inner cursor.
        continueCursor = JSON.stringify({ pi, ic: inner.continueCursor });
      }
    }

    return { page, isDone, continueCursor };
  },
});

export const getById = query({
  args: { variableId: v.id("environmentVariables") },
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (variable?.deletedAt) return null;
    return variable;
  },
});

export const getVersionHistory = query({
  args: {
    variableId: v.id("environmentVariables"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    // Check if version history is enabled for this org
    const variable = await ctx.db.get(args.variableId);
    if (!variable) return [];
    const project = await ctx.db.get(variable.projectId);
    if (!project) return [];

    // Access control: version rows carry per-version vaultRefs, so a caller
    // must have effective access to the parent variable (owner / assigned
    // PM/TL / developer with a grant, env-scope respected). Never leak
    // history for variables outside the caller's access.
    const access = await getVariableAccess(ctx, actor._id, variable);
    if (access === null) {
      throw new Error("No access to this variable");
    }

    const versionHistoryCheck = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "variable_version_history"
    );
    if (!versionHistoryCheck.allowed) {
      return [];
    }

    const versions = await ctx.db
      .query("variableVersions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .order("desc")
      .take(args.limit ?? 50);

    const versionsWithUsers = await Promise.all(
      versions.map(async (version) => {
        const user = await ctx.db.get(version.changedBy);
        return {
          ...version,
          changedByUser: user ? { name: user.name, email: user.email } : null,
        };
      })
    );

    return versionsWithUsers;
  },
});

/**
 * List variables with unified-role and per-variable access information
 *
 * Access rules (unified model — see convex/authz.ts):
 * - Owners: write access to every variable
 * - Project managers / team leads assigned to the project: write access
 * - Developers assigned to the project: value access via per-variable
 *   grants; they still see metadata (no vault refs) for ungranted variables
 * - Unassigned org members: read-only on variables explicitly shared with
 *   them via an active grant (per-variable viewer sharing)
 */
async function listWithAccessCore(
  ctx: QueryCtx,
  args: { projectId: Id<"projects">; userId: Id<"users">; limit?: number }
) {
  const resolved = await resolveProjectAccessContext(
    ctx,
    args.projectId,
    args.userId
  );
  if (!resolved) {
    return [];
  }
  const { access } = resolved;

  const allVariables = await ctx.db
    .query("environmentVariables")
    .withIndex("by_project_deleted", (q) =>
      q.eq("projectId", args.projectId).eq("deletedAt", undefined)
    )
    .take(args.limit ?? 500);
  // Scoped developers never receive out-of-scope variables at all —
  // not even their metadata/keys
  const variables = allVariables.filter(
    (variable) =>
      variable.deletedAt === undefined &&
      isEnvironmentScopeAllowed(access.environmentScope, variable.environments)
  );

  const variablesWithAccess = variables.map((variable) =>
    mapVariableRow(variable, access)
  );

  // Assigned members (and owners) may list metadata for every variable;
  // grant-only viewers see just the variables shared with them.
  if (!access.isOwner && !access.assigned) {
    return variablesWithAccess.filter((v) => v.hasAccess);
  }

  return variablesWithAccess;
}

export const listWithAccess = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return listWithAccessCore(ctx, { ...args, userId: actor._id });
  },
});

/**
 * Cursor-paginated variant of listWithAccess for "load more on scroll".
 *
 * Reads exactly one page of the project's variables at a time via Convex
 * `.paginate()` on the by_project index, instead of the take(limit) window
 * listWithAccess uses. Authorization, environment scope, the ONE prefetched
 * grant map, and the per-row access computation are IDENTICAL to
 * listWithAccess — the returned row shape matches exactly (variable fields
 * with vaultRef present only when hasAccess, plus hasAccess/permission/
 * roleAccess/userRole/projectRole/canManagePermissions).
 *
 * IMPORTANT: for grant-only viewers (not owner, not assigned) inaccessible
 * rows are filtered out of the page — exactly as listWithAccess does. That
 * can yield fewer than paginationOpts.numItems rows in a page; that is
 * expected with usePaginatedQuery (it requests more). isDone/continueCursor
 * are taken verbatim from the raw paginate result so the cursor stays valid.
 * Env-scoped developers never receive out-of-scope variables at all (the
 * scope filter also shrinks the page, same as listWithAccess).
 */
export const listWithAccessPaginated = query({
  args: {
    projectId: v.id("projects"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (!resolved) {
      return {
        page: [],
        isDone: true,
        continueCursor: args.paginationOpts.cursor ?? "",
      };
    }
    const { access } = resolved;

    // Paginate the project's variables. isDone/continueCursor come straight
    // from this result and are never recomputed after filtering.
    const result = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .order("desc")
      .paginate(args.paginationOpts);

    // Scoped developers never receive out-of-scope variables at all —
    // not even their metadata/keys (identical to listWithAccess).
    const pageVariables = result.page.filter(
      (variable) =>
        variable.deletedAt === undefined &&
        isEnvironmentScopeAllowed(
          access.environmentScope,
          variable.environments
        )
    );

    const mappedPage = pageVariables.map((variable) =>
      mapVariableRow(variable, access)
    );

    // Assigned members (and owners) may list metadata for every variable;
    // grant-only viewers see just the variables shared with them. Filtering
    // shrinks the page but the cursor from paginate() stays valid.
    const finalPage =
      !access.isOwner && !access.assigned
        ? mappedPage.filter((v) => v.hasAccess)
        : mappedPage;

    return {
      page: finalPage,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Per-project variable search — access-aware and COMPLETE.
 *
 * Reuses listWithAccessPaginated's exact access model
 * (resolveProjectAccessContext + mapVariableRow) so a hit can never surface a
 * variable the caller couldn't see in the list: env-scoped developers only
 * match in-scope variables, and grant-only viewers only see variables shared
 * with them. Unlike the paginated list this walks the project's ENTIRE active
 * variable set (bounded — hundreds at most) and matches in memory on
 * key/description substring plus tag NAMES, so a hit is never hidden behind an
 * unloaded page. Deliberately NO Convex searchIndex — the candidate set is
 * small enough that collect + predicate is the right tool.
 *
 * Returns the same row shape as the list (mapVariableRow) so the existing row
 * component renders results unchanged (env badges / tags / updated-at per hit).
 * Capped at 100 rows sorted by key; `truncated` tells the UI to suggest
 * narrowing. `environment` (the selected env tab) narrows to that env's copy.
 */
export const searchInProject = query({
  args: {
    projectId: v.id("projects"),
    searchTerm: v.string(),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (!resolved) return { results: [], truncated: false };
    const { access } = resolved;

    const searchLower = args.searchTerm.trim().toLowerCase();
    if (searchLower === "") return { results: [], truncated: false };

    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .collect();

    // Resolve every tag referenced by this project's variables ONCE, so tag-name
    // matching is a map lookup rather than a db.get per (variable, tag).
    const tagIds = new Set<string>();
    for (const variable of variables) {
      for (const id of variable.tagIds ?? []) tagIds.add(id as string);
    }
    const tagNameById = new Map<string, string>();
    await Promise.all(
      [...tagIds].map(async (id) => {
        const tag = await ctx.db.get(id as Id<"variableTags">);
        if (tag && !tag.deletedAt) tagNameById.set(id, tag.name.toLowerCase());
      })
    );

    const matches = variables.filter((variable) => {
      // Same env-scope gate as listWithAccessPaginated: scoped developers never
      // even see out-of-scope keys.
      if (
        !isEnvironmentScopeAllowed(
          access.environmentScope,
          variable.environments
        )
      ) {
        return false;
      }
      // Env tab narrows to variables holding that environment's copy.
      if (
        args.environment &&
        !variable.environments.includes(args.environment)
      ) {
        return false;
      }
      const tagMatch = (variable.tagIds ?? []).some((id) =>
        tagNameById.get(id as string)?.includes(searchLower)
      );
      return (
        variable.key.toLowerCase().includes(searchLower) ||
        variable.description?.toLowerCase().includes(searchLower) ||
        tagMatch
      );
    });

    const mapped = matches
      .map((variable) => mapVariableRow(variable, access))
      // Grant-only viewers see only variables shared with them — identical to
      // listWithAccessPaginated's page filter.
      .filter((v) => access.isOwner || access.assigned || v.hasAccess)
      .sort((a, b) => a.key.localeCompare(b.key));

    const RESULT_LIMIT = 100;
    return {
      results: mapped.slice(0, RESULT_LIMIT),
      truncated: mapped.length > RESULT_LIMIT,
    };
  },
});

/**
 * List variable metadata (keys, versions, environments) WITHOUT vault refs.
 * Used by the VS Code extension via WebSocket subscription to detect changes
 * reactively, then fetch decrypted values via HTTP only when needed.
 */
export const listMetadataByProject = query({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const allVariables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(args.limit ?? 500);
    const variables = allVariables.filter(
      (variable) => variable.deletedAt === undefined
    );

    const filtered = args.environment
      ? variables.filter((v) => v.environments.includes(args.environment!))
      : variables;

    return filtered.map((v) => ({
      _id: v._id,
      key: v.key,
      environments: v.environments,
      isSensitive: v.isSensitive,
      version: v.version,
      updatedAt: v.updatedAt,
      description: v.description,
    }));
  },
});

export const globalSearchWithAccess = query({
  args: {
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Overall result budget AND per-project read cap (mirrors the `search`
    // query's resultLimit pattern just above): bounds both how much this
    // query ever returns and — critically — how many rows it ever reads out
    // of a single project, so a large org with an active-editor project can
    // never turn "type two characters" into an unbounded scan of every
    // non-deleted variable in every accessible project.
    const RESULT_LIMIT = 50;

    const searchLower = args.searchTerm.toLowerCase();
    // Light shape only — trimmed to exactly the fields the command palette
    // (apps/web/src/components/command-palette/command-palette.tsx, the sole
    // consumer via useGlobalSearch) renders. vaultRef was never included here
    // even before this fix; description/tagIds(raw)/projectId/projectIcon/
    // organizationId/organizationSlug are computed internally but not part of
    // the public shape since nothing reads them.
    const results: Array<{
      _id: string;
      key: string;
      environments?: string[];
      isSensitive?: boolean;
      tags?: Array<{ _id: string; name: string; color: string }>;
      projectName: string;
      projectSlug: string;
      projectColor?: string;
      organizationName: string;
    }> = [];

    // Pre-fetch tag cache for resolving tag names during search
    const tagCache = new Map<
      string,
      { _id: string; name: string; color: string }
    >();

    // Batch tag resolution: collect the union of not-yet-cached tag ids across
    // a set of variables and fetch each unique tag exactly once (in parallel)
    // instead of a sequential get per (variable, tag). tagCache dedupes across
    // the whole search so a shared tag is never fetched twice.
    const preloadTags = async (vars: Doc<"environmentVariables">[]) => {
      const missing = new Set<string>();
      for (const variable of vars) {
        if (!variable.tagIds) continue;
        for (const tagId of variable.tagIds) {
          const tagIdStr = tagId as string;
          if (!tagCache.has(tagIdStr)) missing.add(tagIdStr);
        }
      }
      if (missing.size === 0) return;
      const fetched = await Promise.all(
        [...missing].map((id) => ctx.db.get(id as Id<"variableTags">))
      );
      for (const tag of fetched) {
        if (tag && !tag.deletedAt) {
          tagCache.set(tag._id as string, {
            _id: tag._id as string,
            name: tag.name,
            color: tag.color,
          });
        }
      }
    };

    const resolveTagsFor = (variable: Doc<"environmentVariables">) => {
      const resolvedTags: Array<{ _id: string; name: string; color: string }> =
        [];
      if (variable.tagIds) {
        for (const tagId of variable.tagIds) {
          const cached = tagCache.get(tagId as string);
          if (cached) resolvedTags.push(cached);
        }
      }
      return resolvedTags;
    };

    const matchesSearch = (variable: Doc<"environmentVariables">) => {
      const tagNames =
        variable.tagIds
          ?.map((id) => tagCache.get(id as string)?.name ?? "")
          .filter(Boolean) ?? [];
      return (
        variable.key.toLowerCase().includes(searchLower) ||
        variable.description?.toLowerCase().includes(searchLower) ||
        variable.environments?.some((e) =>
          e.toLowerCase().includes(searchLower)
        ) ||
        tagNames.some((name) => name.toLowerCase().includes(searchLower))
      );
    };

    // Get all ACTIVE org memberships for this user — a suspended org is
    // excluded so its variables never surface in cross-org search.
    const memberships = (
      await ctx.db
        .query("organizationMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect()
    ).filter((m) => !isSuspendedMembership(m));

    // Pre-fetch project assignments once. projectMembers is a pure scope
    // assignment — its legacy role field is never consulted.
    const allProjectMemberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();

    // Group project assignments by org (resolved lazily)
    const assignedProjectsByOrg = new Map<string, Array<Id<"projects">>>();
    const resolvedProjects = new Map<
      string,
      {
        _id: Id<"projects">;
        name: string;
        slug: string;
        icon?: string;
        color?: string;
        organizationId: string;
        deletedAt?: number;
      }
    >();

    // Environment scope per assignment (constrains developers only)
    const scopeByProject = new Map<string, string[] | undefined>();

    for (const pm of allProjectMemberships) {
      scopeByProject.set(pm.projectId as string, pm.environments);
      if (!resolvedProjects.has(pm.projectId)) {
        const project = await ctx.db.get(pm.projectId);
        if (project) {
          resolvedProjects.set(pm.projectId, {
            _id: project._id,
            name: project.name,
            slug: project.slug,
            icon: project.icon,
            color: project.color,
            organizationId: project.organizationId,
            deletedAt: project.deletedAt,
          });
        }
      }
      const project = resolvedProjects.get(pm.projectId);
      if (project && !project.deletedAt) {
        const orgId = project.organizationId;
        if (!assignedProjectsByOrg.has(orgId)) {
          assignedProjectsByOrg.set(orgId, []);
        }
        assignedProjectsByOrg.get(orgId)!.push(pm.projectId);
      }
    }

    // Projects already covered by role/assignment access (used to avoid
    // double-processing in the grant-holder pass below)
    const coveredProjectIds = new Set<string>();

    for (const membership of memberships) {
      const org = await ctx.db.get(membership.organizationId);
      if (!org) continue;

      const orgRole = normalizeOrgRole(membership.role);
      // Per-ORG resolution (multi-org search loop) — bounded by the caller's
      // org count, not by rows.
      const searchProfile = await getRoleProfile(ctx, orgRole);
      const isOwner = bypassesAssignment(searchProfile);

      // Metadata visibility: owners see all org projects, everyone else
      // sees the projects they are assigned to.
      let accessibleProjects: Array<{
        _id: Id<"projects">;
        name: string;
        slug: string;
        icon?: string;
        color?: string;
      }> = [];

      if (isOwner) {
        const allOrgProjects = await ctx.db
          .query("projects")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId)
          )
          .collect();
        accessibleProjects = allOrgProjects
          .filter((p) => p.deletedAt === undefined)
          .map((p) => ({
            _id: p._id,
            name: p.name,
            slug: p.slug,
            icon: p.icon,
            color: p.color,
          }));
      } else {
        const assignedIds =
          assignedProjectsByOrg.get(membership.organizationId) ?? [];
        for (const projectId of assignedIds) {
          const project = resolvedProjects.get(projectId);
          if (project) {
            accessibleProjects.push({
              _id: project._id,
              name: project.name,
              slug: project.slug,
              icon: project.icon,
              color: project.color,
            });
          }
        }
      }

      for (const project of accessibleProjects) {
        coveredProjectIds.add(project._id as string);

        // Read the project's full (non-deleted) variable set. A per-project
        // .take() cap was tried for cost, but it broke search correctness:
        // .take(n) returns rows in creation order, so a project's NEWEST
        // variables silently fall out of search once it exceeds the cap —
        // a user couldn't find a variable they just created. Search must see
        // every candidate; the overall RESULT_LIMIT still bounds what's
        // RETURNED. (If per-keystroke search cost becomes a problem on very
        // large orgs, the right fix is a Convex search index on `key`, not a
        // correctness-breaking read cap.)
        //
        // by_project_deleted skips soft-deleted rows AT THE INDEX — trash
        // can dwarf the active set (hundreds of dead docs per project) and
        // was previously read on every keystroke just to be filtered out.
        const variables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project_deleted", (q) =>
            q.eq("projectId", project._id).eq("deletedAt", undefined)
          )
          .collect();

        // Resolve tags for variables in this project batch (one batched fetch)
        await preloadTags(variables);

        // Scoped developers never receive out-of-scope variables at all —
        // not even their metadata/keys
        const environmentScope = hasCapability(
          searchProfile,
          "access.env_scoped"
        )
          ? scopeByProject.get(project._id as string)
          : undefined;

        const matches = variables.filter(
          (variable) =>
            isEnvironmentScopeAllowed(
              environmentScope,
              variable.environments
            ) && matchesSearch(variable)
        );

        for (const variable of matches) {
          // Owners and assigned project members may list variable metadata
          const resolvedTags = resolveTagsFor(variable);

          results.push({
            _id: variable._id as string,
            key: variable.key,
            environments: variable.environments,
            isSensitive: variable.isSensitive,
            tags: resolvedTags.length > 0 ? resolvedTags : undefined,
            projectName: project.name,
            projectSlug: project.slug,
            projectColor: project.color,
            organizationName: org.name,
          });

          if (results.length >= RESULT_LIMIT) break;
        }
        if (results.length >= RESULT_LIMIT) break;
      }
      if (results.length >= RESULT_LIMIT) break;
    }

    // Per-variable viewer sharing: grant holders may list metadata for
    // variables explicitly shared with them, even without an assignment.
    if (results.length < RESULT_LIMIT) {
      const grants = await ctx.db
        .query("variablePermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", actor._id).eq("isActive", true)
        )
        .collect();

      const now = Date.now();
      const memberOrgIds = new Set(
        memberships.map((m) => m.organizationId as string)
      );
      const seenVariableIds = new Set(results.map((r) => r._id));

      for (const grant of grants) {
        if (results.length >= RESULT_LIMIT) break;
        if (grant.expiresAt && grant.expiresAt <= now) continue;
        if (seenVariableIds.has(grant.variableId as string)) continue;

        const variable = await ctx.db.get(grant.variableId);
        if (!variable || variable.deletedAt) continue;
        if (coveredProjectIds.has(variable.projectId as string)) continue;

        const project = await ctx.db.get(variable.projectId);
        if (!project || project.deletedAt) continue;
        if (!memberOrgIds.has(project.organizationId as string)) continue;

        const org = await ctx.db.get(project.organizationId);
        if (!org) continue;

        await preloadTags([variable]);
        if (!matchesSearch(variable)) continue;

        const resolvedTags = resolveTagsFor(variable);

        results.push({
          _id: variable._id as string,
          key: variable.key,
          environments: variable.environments,
          isSensitive: variable.isSensitive,
          tags: resolvedTags.length > 0 ? resolvedTags : undefined,
          projectName: project.name,
          projectSlug: project.slug,
          projectColor: project.color,
          organizationName: org.name,
        });
        seenVariableIds.add(variable._id as string);
      }
    }

    return results;
  },
});

/**
 * List a project's soft-deleted variables that are still within the
 * PURGE_RETENTION_DAYS restore window (vaultGc purges anything older, so
 * those are excluded here rather than surfaced as "restorable").
 *
 * Authorization mirrors restore: only owners / assigned PM / team lead
 * ("project:delete_variable") may see the trash list. Like the other
 * list-style queries in this file (listWithAccess, listMetadataByProject)
 * this returns [] rather than throwing when the project is gone or the
 * caller lacks access, so the UI can render nothing instead of erroring.
 */
export const getDeleted = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    try {
      await authorizeVariableAccess(ctx, {
        userId: actor._id,
        projectId: args.projectId,
        action: "project:delete_variable",
        preloadedProject: project,
      });
    } catch {
      return [];
    }

    const cutoff = Date.now() - PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    // by_project_deleted reads exactly this project's soft-deleted rows in
    // the restore window — never-deleted rows (deletedAt undefined, which
    // sorts below all numbers) fall outside the gte range, and active rows
    // never inflate the read like a by_project scan would (a project with
    // >500 active variables previously hid its trash entirely).
    // desc: newest deletions first, so when the trash exceeds the 100-row
    // cap it's the OLDEST (closest to auto-purge) that fall off — an
    // ascending take(100) hid a just-deleted item behind old trash.
    const deletedVariables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).gte("deletedAt", cutoff)
      )
      .order("desc")
      .take(100);

    return deletedVariables.map((variable) => ({
      _id: variable._id,
      key: variable.key,
      deletedAt: variable.deletedAt as number,
      environments: variable.environments,
    }));
  },
});

/**
 * Internal: which of the proposed environments already carry an ACTIVE
 * variable with this key? Used by actions (createWithValue) to reject
 * clashes BEFORE writing the secret value to the vault — checking only
 * inside the create mutation leaked an orphaned vault secret per clash.
 * Empty array = the create is allowed (same key across disjoint
 * environments is legal).
 */
export const getEnvironmentConflictsInternal = internalQuery({
  args: {
    projectId: v.id("projects"),
    key: v.string(),
    environments: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) =>
    findEnvironmentConflicts(ctx, {
      projectId: args.projectId,
      key: args.key,
      environments: args.environments,
    }),
});
