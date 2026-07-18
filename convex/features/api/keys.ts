import { v, ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "../../_generated/server";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { authorizeVariableAccess } from "../../lib/authHelpers";
import { assertOrgMembership, hasCapability } from "../../lib/authz";
import { checkBooleanFeature } from "../featureRegistry/gates";

/**
 * API keys — the generalized token platform.
 *
 * Evolves the project-scoped `serviceTokens` (CI/CD-only, variables-only)
 * into a scoped key platform serving the public REST API, the MCP server,
 * and (via a compat lookup) the legacy CI/CD pull surface. A key is a
 * long-lived, READ-ONLY credential scoped to:
 *   - project(s): "all" (org-wide) or an explicit project id list
 *   - environment(s): "all" or an explicit environment list
 *   - resource(s): a subset of ["variables", "accounts", "projects"]
 *
 * Only its SHA-256 hash is stored; the plaintext (`envpk_<40 hex>`) is
 * returned exactly once from `create`. Minting an org-wide key is an
 * owner-only power (it grants read access across every current AND future
 * project in the org); minting a project-scoped key requires
 * `project:manage_permissions` on every project named in scope — the same
 * bar as creating a CI/CD service token, since minting a key IS granting
 * read access.
 *
 * Pro-gated via the `public_api` registry feature, enforced both here
 * (creation) and on every authorize call (authorize.ts).
 */

export const VALID_ENVIRONMENTS = ["development", "staging", "production"];
export const VALID_RESOURCES = ["variables", "accounts", "projects"];
const MAX_KEYS_PER_ORG = 25; // hygiene bound, not a tier limit

export const surfaceValidator = v.union(
  v.literal("github_action"),
  v.literal("rest_api"),
  v.literal("mcp_server")
);
type Surface = "github_action" | "rest_api" | "mcp_server";

// Which registry flag gates minting a key for a surface. github_action rides
// public_api — the Action pulls through /api/v1/secrets (⚖️ PLAN D2).
const SURFACE_GATE: Record<Surface, "public_api" | "mcp_server"> = {
  github_action: "public_api",
  rest_api: "public_api",
  mcp_server: "mcp_server",
};

function assertValidName(name: string): void {
  if (name.trim().length === 0 || name.length > 100) {
    throw new ConvexError("Key name must be 1-100 characters");
  }
}

function assertValidEnvironments(environments: "all" | string[]): void {
  if (environments === "all") return;
  if (environments.length === 0) {
    throw new ConvexError(
      'Key must be scoped to at least one environment, or "all"'
    );
  }
  for (const env of environments) {
    if (!VALID_ENVIRONMENTS.includes(env)) {
      throw new ConvexError(`Unknown environment "${env}"`);
    }
  }
}

function assertValidResources(resources: string[]): void {
  if (resources.length === 0) {
    throw new ConvexError("Key must be scoped to at least one resource");
  }
  for (const resource of resources) {
    if (!VALID_RESOURCES.includes(resource)) {
      throw new ConvexError(`Unknown resource "${resource}"`);
    }
  }
}

function assertValidExpiry(expiresAt: number | undefined): void {
  if (expiresAt !== undefined && expiresAt <= Date.now()) {
    throw new ConvexError("expiresAt must be in the future");
  }
}

/**
 * Surfaces are required and explicit on every new key. A github_action key
 * must be shaped like the one credential the Action pull path accepts: a
 * single project with the "variables" resource — anything else would mint
 * fine and then fail only at CI time (⚖️ PLAN G3).
 */
function assertValidSurfaces(
  surfaces: Surface[],
  scopeProjects: "all" | unknown[],
  scopeResources: string[]
): void {
  if (surfaces.length === 0) {
    throw new ConvexError("Key must be enabled for at least one surface");
  }
  if (new Set(surfaces).size !== surfaces.length) {
    throw new ConvexError("Duplicate surface");
  }
  if (surfaces.includes("github_action")) {
    if (scopeProjects === "all" || scopeProjects.length !== 1) {
      throw new ConvexError(
        "A GitHub Action key must be scoped to exactly one project — the Action's pull endpoint takes no project parameter, the key IS the project scope"
      );
    }
    if (!scopeResources.includes("variables")) {
      throw new ConvexError(
        'A GitHub Action key must include the "variables" resource — that is all the Action pulls'
      );
    }
  }
}

/**
 * Authorize a caller to manage (list/revoke) a specific key, based on its
 * scope. Org-wide keys (scopeProjects "all") require the org OWNER —
 * mirrors the create-time rule. Project-scoped keys require
 * `project:manage_permissions` on EVERY project in scope, since any one of
 * those projects' managers effectively controls the credential.
 */
async function assertCanManageKey(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  key: Doc<"apiKeys">
): Promise<void> {
  if (key.scopeProjects === "all") {
    const { profile: keyManagerProfile } = await assertOrgMembership(
      ctx,
      userId,
      key.organizationId
    );
    if (!hasCapability(keyManagerProfile, "org.api_keys")) {
      throw new ConvexError(
        "Managing API keys requires the API-keys capability (owner by default)."
      );
    }
    return;
  }
  for (const projectId of key.scopeProjects) {
    await authorizeVariableAccess(ctx, {
      userId,
      projectId,
      action: "project:manage_permissions",
    });
  }
}

/**
 * Store a freshly minted key hash. Internal — only the `create` action below
 * calls it (the caller's JWT identity propagates through runMutation).
 */
export const _store = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
    scopeEnvironments: v.union(v.literal("all"), v.array(v.string())),
    scopeResources: v.array(v.string()),
    surfaces: v.array(surfaceValidator),
    expiresAt: v.optional(v.number()),
    tokenHash: v.string(),
  },
  returns: v.id("apiKeys"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    assertValidName(args.name);
    assertValidEnvironments(args.scopeEnvironments);
    assertValidResources(args.scopeResources);
    assertValidSurfaces(args.surfaces, args.scopeProjects, args.scopeResources);
    assertValidExpiry(args.expiresAt);

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new ConvexError("Organization not found");
    }

    if (args.scopeProjects === "all") {
      // Org-wide scope grants read access to every current AND future
      // project in the org — an owner-only power (⚖️ PLAN §1).
      const { profile: keyManagerProfile } = await assertOrgMembership(
        ctx,
        actor._id,
        args.organizationId
      );
      if (!hasCapability(keyManagerProfile, "org.api_keys")) {
        throw new ConvexError(
          "Managing API keys requires the API-keys capability (owner by default)."
        );
      }
    } else {
      if (args.scopeProjects.length === 0) {
        throw new ConvexError(
          'Key must be scoped to at least one project, or "all"'
        );
      }
      for (const projectId of args.scopeProjects) {
        const project = await ctx.db.get(projectId);
        if (
          !project ||
          project.deletedAt !== undefined ||
          project.organizationId !== args.organizationId
        ) {
          throw new ConvexError("Project not found");
        }
        await authorizeVariableAccess(ctx, {
          userId: actor._id,
          projectId,
          action: "project:manage_permissions",
          preloadedProject: project,
        });
      }
    }

    // Every selected surface's gate must pass — a key minted for a surface
    // the org's plan doesn't include would be dead on arrival there.
    const gates = [...new Set(args.surfaces.map((s) => SURFACE_GATE[s]))];
    for (const gateFeature of gates) {
      const gate = await checkBooleanFeature(
        ctx.db,
        args.organizationId,
        gateFeature
      );
      if (!gate.allowed) {
        throw new ConvexError(
          gateFeature === "mcp_server"
            ? "The MCP server is available on the Pro plan. Upgrade to create MCP keys."
            : "The public API is available on the Pro plan. Upgrade to create API keys."
        );
      }
    }

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const live = existing.filter((k) => k.revokedAt === undefined);
    if (live.length >= MAX_KEYS_PER_ORG) {
      throw new ConvexError(
        `An organization can have at most ${MAX_KEYS_PER_ORG} active API keys — revoke unused ones first`
      );
    }

    const now = Date.now();
    const keyId = await ctx.db.insert("apiKeys", {
      organizationId: args.organizationId,
      name: args.name.trim(),
      tokenHash: args.tokenHash,
      scopeProjects: args.scopeProjects,
      scopeEnvironments: args.scopeEnvironments,
      scopeResources: args.scopeResources,
      surfaces: args.surfaces,
      createdBy: actor._id,
      createdAt: now,
      expiresAt: args.expiresAt,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "api.key_created",
      details: JSON.stringify({
        keyId,
        name: args.name.trim(),
        scopeProjects: args.scopeProjects,
        scopeEnvironments: args.scopeEnvironments,
        scopeResources: args.scopeResources,
        surfaces: args.surfaces,
        expiresAt: args.expiresAt,
      }),
      createdAt: now,
    });

    return keyId;
  },
});

/**
 * Mint an API key. Runs as an action for Web Crypto (secure random +
 * SHA-256); all authorization/gating happens in _store with the caller's
 * propagated identity. Returns the PLAINTEXT key — the only time it is
 * ever visible. The UI must show it once and never persist it.
 */
export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
    scopeEnvironments: v.union(v.literal("all"), v.array(v.string())),
    scopeResources: v.array(v.string()),
    // Optional ONLY for the deploy window where the previous web bundle
    // (which doesn't send surfaces) is still serving — those creates get
    // the pre-surfaces default below. The UI always passes it explicitly.
    surfaces: v.optional(v.array(surfaceValidator)),
    expiresAt: v.optional(v.number()),
  },
  returns: v.object({
    keyId: v.id("apiKeys"),
    token: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ keyId: Id<"apiKeys">; token: string }> => {
    const bytes = new Uint8Array(20); // 160-bit
    crypto.getRandomValues(bytes);
    const token =
      "envpk_" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token)
    );
    const tokenHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const keyId = await ctx.runMutation(internal.features.api.keys._store, {
      organizationId: args.organizationId,
      name: args.name,
      scopeProjects: args.scopeProjects,
      scopeEnvironments: args.scopeEnvironments,
      scopeResources: args.scopeResources,
      surfaces: args.surfaces ?? ["rest_api", "mcp_server"],
      expiresAt: args.expiresAt,
      tokenHash,
    });

    return { keyId, token };
  },
});

/**
 * List an organization's keys (hash never leaves the server), filtered to
 * only those the caller is authorized to manage: org-wide keys are visible
 * to owners only; project-scoped keys are visible only when the caller has
 * `project:manage_permissions` on EVERY project in that key's scope. This
 * mirrors create/revoke authorization exactly instead of gating the whole
 * query on a single role check.
 */
export const listForOrganization = query({
  args: { organizationId: v.id("organizations") },
  returns: v.array(
    v.object({
      _id: v.id("apiKeys"),
      name: v.string(),
      scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
      scopeEnvironments: v.union(v.literal("all"), v.array(v.string())),
      scopeResources: v.array(v.string()),
      // null = pre-surfaces key, valid on every surface
      surfaces: v.union(v.array(surfaceValidator), v.null()),
      createdAt: v.number(),
      createdByName: v.string(),
      lastUsedAt: v.union(v.number(), v.null()),
      revokedAt: v.union(v.number(), v.null()),
      expiresAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    // Base requirement: must at least be a member of the org.
    await assertOrgMembership(ctx, actor._id, args.organizationId);

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const visible: Doc<"apiKeys">[] = [];
    for (const key of keys) {
      try {
        await assertCanManageKey(ctx, actor._id, key);
        visible.push(key);
      } catch {
        // Caller can't manage this key's scope — omit it rather than
        // failing the whole list.
      }
    }

    const users = new Map<string, string>();
    const results = [];
    for (const k of visible) {
      let createdByName = users.get(k.createdBy as string);
      if (createdByName === undefined) {
        const u = await ctx.db.get(k.createdBy);
        createdByName = u?.name ?? u?.email ?? "Unknown";
        users.set(k.createdBy as string, createdByName);
      }
      results.push({
        _id: k._id,
        name: k.name,
        scopeProjects: k.scopeProjects,
        scopeEnvironments: k.scopeEnvironments,
        scopeResources: k.scopeResources,
        surfaces: k.surfaces ?? null,
        createdAt: k.createdAt,
        createdByName,
        lastUsedAt: k.lastUsedAt ?? null,
        revokedAt: k.revokedAt ?? null,
        expiresAt: k.expiresAt ?? null,
      });
    }

    // Live keys first, newest first within each group.
    return results.sort((a, b) => {
      const aRevoked = a.revokedAt !== null ? 1 : 0;
      const bRevoked = b.revokedAt !== null ? 1 : 0;
      if (aRevoked !== bRevoked) return aRevoked - bRevoked;
      return b.createdAt - a.createdAt;
    });
  },
});

/**
 * Revoke a key — takes effect on the next authorize attempt (the authorize
 * path re-reads the row every time; there is no cached session to expire).
 */
export const revoke = mutation({
  args: { keyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const key = await ctx.db.get(args.keyId);
    if (!key) throw new ConvexError("API key not found");
    if (key.revokedAt !== undefined) return null;

    await assertCanManageKey(ctx, actor._id, key);

    const now = Date.now();
    await ctx.db.patch(args.keyId, { revokedAt: now, revokedBy: actor._id });
    await ctx.db.insert("auditLogs", {
      organizationId: key.organizationId,
      userId: actor._id,
      action: "api.key_revoked",
      details: JSON.stringify({ keyId: args.keyId, name: key.name }),
      createdAt: now,
    });
    return null;
  },
});
