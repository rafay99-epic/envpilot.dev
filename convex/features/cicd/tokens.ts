import { v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { authorizeVariableAccess } from "../../lib/authHelpers";
import { checkBooleanFeature } from "../featureRegistry/gates";

/**
 * CI/CD service tokens — machine identities for the GitHub Action.
 *
 * A token is a long-lived, READ-ONLY credential scoped to one project and an
 * explicit environment list. Only its SHA-256 hash is stored; the plaintext
 * (`envpk_<40 hex>`) is returned exactly once from `create`. Management
 * (create/list/revoke) requires the `project:manage_permissions` capability —
 * org owners, or project managers / team leads assigned to the project —
 * because minting a token IS granting read access (e.g. handing a
 * production-scoped token to a DevOps engineer who has no Envpilot account).
 *
 * Pro-gated via the `cicd_service_tokens` registry feature, enforced both
 * here (creation) and on every pull (pull.ts).
 */

export const VALID_ENVIRONMENTS = ["development", "staging", "production"];
const MAX_TOKENS_PER_PROJECT = 25; // hygiene bound, not a tier limit

function assertValidScope(name: string, environments: string[]): void {
  if (name.trim().length === 0 || name.length > 100) {
    throw new Error("Token name must be 1-100 characters");
  }
  if (environments.length === 0) {
    throw new Error("Token must be scoped to at least one environment");
  }
  for (const env of environments) {
    if (!VALID_ENVIRONMENTS.includes(env)) {
      throw new Error(`Unknown environment "${env}"`);
    }
  }
}

/**
 * Store a freshly minted token hash. Internal — only the `create` action
 * below calls it (the caller's JWT identity propagates through runMutation).
 *
 * DEPRECATED CREATE PATH: the web UI no longer calls `create`/`_store` —
 * Action credentials are minted as apiKeys with the github_action surface
 * (features/api/keys.ts). Both are kept registered only until the
 * serviceTokens retirement PR deletes this module with the table.
 */
export const _store = internalMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    environments: v.array(v.string()),
    tokenHash: v.string(),
  },
  returns: v.id("serviceTokens"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    assertValidScope(args.name, args.environments);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt !== undefined) {
      throw new Error("Project not found");
    }

    await authorizeVariableAccess(ctx, {
      userId: actor._id,
      projectId: args.projectId,
      action: "project:manage_permissions",
      preloadedProject: project,
    });

    const gate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "cicd_service_tokens"
    );
    if (!gate.allowed) {
      throw new Error(
        "CI/CD service tokens are available on the Pro plan. Upgrade to create deploy tokens."
      );
    }

    const existing = await ctx.db
      .query("serviceTokens")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const live = existing.filter((t) => t.revokedAt === undefined);
    if (live.length >= MAX_TOKENS_PER_PROJECT) {
      throw new Error(
        `A project can have at most ${MAX_TOKENS_PER_PROJECT} active tokens — revoke unused ones first`
      );
    }

    const now = Date.now();
    const tokenId = await ctx.db.insert("serviceTokens", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      name: args.name.trim(),
      tokenHash: args.tokenHash,
      environments: args.environments,
      createdBy: actor._id,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      userId: actor._id,
      action: "cicd.token_created",
      details: JSON.stringify({
        tokenId,
        projectId: args.projectId,
        name: args.name.trim(),
        environments: args.environments,
      }),
      createdAt: now,
    });

    return tokenId;
  },
});

/**
 * Mint a service token. Runs as an action for Web Crypto (secure random +
 * SHA-256); all authorization/gating happens in _store with the caller's
 * propagated identity. Returns the PLAINTEXT token — the only time it is
 * ever visible. The UI must show it once and never persist it.
 */
export const create = action({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    environments: v.array(v.string()),
  },
  returns: v.object({
    tokenId: v.id("serviceTokens"),
    token: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ tokenId: Id<"serviceTokens">; token: string }> => {
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

    const tokenId = await ctx.runMutation(
      internal.features.cicd.tokens._store,
      {
        projectId: args.projectId,
        name: args.name,
        environments: args.environments,
        tokenHash,
      }
    );

    return { tokenId, token };
  },
});

/**
 * List a project's tokens (hash never leaves the server). Same capability
 * as creation — token metadata reveals the project's CI surface.
 */
export const listForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("serviceTokens"),
      name: v.string(),
      environments: v.array(v.string()),
      createdAt: v.number(),
      createdByName: v.string(),
      lastUsedAt: v.union(v.number(), v.null()),
      revokedAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    await authorizeVariableAccess(ctx, {
      userId: actor._id,
      projectId: args.projectId,
      action: "project:manage_permissions",
    });

    const tokens = await ctx.db
      .query("serviceTokens")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const users = new Map<string, string>();
    const results = [];
    for (const t of tokens) {
      let createdByName = users.get(t.createdBy as string);
      if (createdByName === undefined) {
        const u = await ctx.db.get(t.createdBy);
        createdByName = u?.name ?? u?.email ?? "Unknown";
        users.set(t.createdBy as string, createdByName);
      }
      results.push({
        _id: t._id,
        name: t.name,
        environments: t.environments,
        createdAt: t.createdAt,
        createdByName,
        lastUsedAt: t.lastUsedAt ?? null,
        revokedAt: t.revokedAt ?? null,
      });
    }
    // Live tokens first, newest first within each group.
    return results.sort((a, b) => {
      const aRevoked = a.revokedAt !== null ? 1 : 0;
      const bRevoked = b.revokedAt !== null ? 1 : 0;
      if (aRevoked !== bRevoked) return aRevoked - bRevoked;
      return b.createdAt - a.createdAt;
    });
  },
});

/**
 * Revoke a token — takes effect on the next pull attempt (the pull path
 * re-reads the row every time; there is no cached session to expire).
 */
export const revoke = mutation({
  args: { tokenId: v.id("serviceTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const token = await ctx.db.get(args.tokenId);
    if (!token) throw new Error("Token not found");
    if (token.revokedAt !== undefined) return null;

    await authorizeVariableAccess(ctx, {
      userId: actor._id,
      projectId: token.projectId,
      action: "project:manage_permissions",
    });

    const now = Date.now();
    await ctx.db.patch(args.tokenId, { revokedAt: now, revokedBy: actor._id });
    await ctx.db.insert("auditLogs", {
      organizationId: token.organizationId,
      userId: actor._id,
      action: "cicd.token_revoked",
      details: JSON.stringify({ tokenId: args.tokenId, name: token.name }),
      createdAt: now,
    });
    return null;
  },
});
