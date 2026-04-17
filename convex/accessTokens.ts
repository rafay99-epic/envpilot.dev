import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkBooleanFeature } from "./featureRegistry";

// ── Constants ────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// The only environment names the platform recognises.
// Enforced here (Convex), at the API layer (Zod), and in the UI.
const VALID_ENVIRONMENTS = new Set(["development", "staging", "production"]);
const VALID_EXPIRY_DAYS = new Set([7, 30, 90]);
const MAX_PROJECT_IDS = 50;

/**
 * Generate a cryptographically secure access token using Web Crypto API.
 * Uses rejection sampling to eliminate modulo bias.
 * Output: "ep_at_" + 48 alphanumeric chars (~285 bits of entropy).
 */
function generateAccessToken(): string {
  const charsLen = ACCESS_TOKEN_CHARS.length; // 62
  // Largest multiple of 62 that fits in a byte (0–255): floor(256/62)*62 = 248
  const limit = Math.floor(256 / charsLen) * charsLen;
  let token = "ep_at_";
  let filled = 0;
  // Over-sample to reduce how often we need extra rounds (< 3% rejection rate)
  while (filled < 48) {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < limit) {
        token += ACCESS_TOKEN_CHARS[byte % charsLen];
        filled++;
        if (filled === 48) break;
      }
    }
  }
  return token;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Create a new CI/CD access token.
 * Only admins and team_leads may create tokens.
 * Requires the "access_tokens" feature to be enabled for the org.
 */
export const create = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    organizationId: v.id("organizations"),
    projectIds: v.array(v.id("projects")),
    environments: v.array(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // 1. Check feature gate
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "access_tokens"
    );
    if (!gate.allowed) {
      throw new Error(
        "CI/CD Access Tokens require a Pro plan. Upgrade to create scoped tokens."
      );
    }

    // 2. Validate name length (defence-in-depth — Zod also validates at the API layer)
    if (args.name.trim().length === 0 || args.name.length > 100) {
      throw new Error("Token name must be between 1 and 100 characters.");
    }

    // 3. Validate expiry: must be in the future, within 90 days, and correspond
    //    to one of the three allowed preset durations (7 / 30 / 90 days).
    const now = Date.now();
    if (args.expiresAt <= now) {
      throw new Error("Expiration date must be in the future.");
    }
    if (args.expiresAt > now + NINETY_DAYS_MS) {
      throw new Error(
        "Expiration date cannot be more than 90 days in the future."
      );
    }
    // Check the duration rounds to one of the valid presets (within a 1-minute
    // tolerance to absorb network latency between frontend and backend).
    const durationDays = Math.round(
      (args.expiresAt - now) / (24 * 60 * 60 * 1000)
    );
    if (!VALID_EXPIRY_DAYS.has(durationDays)) {
      throw new Error("Token lifetime must be 7, 30, or 90 days.");
    }

    // 3b. Validate environments — must be known values, no duplicates, max 3.
    if (args.environments.length > 3) {
      throw new Error("A token can restrict up to 3 environments.");
    }
    for (const env of args.environments) {
      if (!VALID_ENVIRONMENTS.has(env)) {
        throw new Error(
          `Invalid environment "${env}". Allowed values: development, staging, production.`
        );
      }
    }
    if (new Set(args.environments).size !== args.environments.length) {
      throw new Error("Environments list must not contain duplicates.");
    }

    // 3c. Validate projectIds — no duplicates, reasonable upper bound.
    if (args.projectIds.length > MAX_PROJECT_IDS) {
      throw new Error(
        `A token can restrict up to ${MAX_PROJECT_IDS} projects.`
      );
    }
    if (new Set(args.projectIds.map(String)).size !== args.projectIds.length) {
      throw new Error("Project list must not contain duplicates.");
    }

    // 4. Resolve the WorkOS user ID → Convex user record.
    //    organizationMembers.userId is v.id("users") (Convex ID), so we must
    //    look up the Convex user before querying the membership index.
    const convexUser = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", args.userId))
      .first();

    if (!convexUser) {
      throw new Error("User account not found. Please log in again.");
    }

    // 5. Check caller is admin or team_lead in the org
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", convexUser._id)
      )
      .first();

    if (!membership) {
      throw new Error("You are not a member of this organization.");
    }

    if (membership.role !== "admin" && membership.role !== "team_lead") {
      throw new Error(
        "Only organization admins and team leads can create access tokens."
      );
    }

    // 6. Validate projectIds belong to the org (if specified)
    for (const projectId of args.projectIds) {
      const project = await ctx.db.get(projectId);
      if (!project || project.organizationId !== args.organizationId) {
        throw new Error(
          `Project ${projectId} does not belong to this organization.`
        );
      }
    }

    // 7. Generate token and insert
    const token = generateAccessToken();

    const tokenId = await ctx.db.insert("accessTokens", {
      userId: args.userId,
      name: args.name,
      token,
      organizationId: args.organizationId,
      projectIds: args.projectIds,
      environments: args.environments,
      expiresAt: args.expiresAt,
      isActive: true,
      createdAt: Date.now(),
    });

    // Return the raw token ONCE — it cannot be retrieved again
    return { tokenId, token };
  },
});

/**
 * List all active access tokens for a user.
 * Token values are masked — only first 12 chars shown.
 */
export const listForUser = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("accessTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Return both active and recently revoked (for audit purposes),
    // but only active ones are shown by default — filter client-side as needed.
    return tokens
      .filter((t) => t.isActive)
      .map((t) => ({
        _id: t._id,
        name: t.name,
        tokenPreview: t.token.slice(0, 12) + "...",
        organizationId: t.organizationId,
        projectIds: t.projectIds,
        environments: t.environments,
        expiresAt: t.expiresAt,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
        isExpired: t.expiresAt < Date.now(),
      }));
  },
});

/**
 * Revoke an access token.
 * The token owner or an org admin can revoke it.
 */
export const revoke = mutation({
  args: {
    tokenId: v.id("accessTokens"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.tokenId);

    if (!record) {
      throw new Error("Access token not found.");
    }

    // Allow revocation if: caller is the owner, OR caller is org admin.
    // Both checks require resolving WorkOS ID → Convex user ID because
    // organizationMembers.userId is v.id("users"), not a WorkOS string.
    const callerConvexUser = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", args.userId))
      .first();

    if (!callerConvexUser) {
      throw new Error("User account not found.");
    }

    // Tokens store the creator's WorkOS ID in userId
    const isOwner = record.userId === args.userId;

    if (!isOwner) {
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q
            .eq("organizationId", record.organizationId)
            .eq("userId", callerConvexUser._id)
        )
        .first();

      if (!membership || membership.role !== "admin") {
        throw new Error(
          "You can only revoke your own access tokens, or tokens in orgs where you are an admin."
        );
      }
    }

    await ctx.db.patch(args.tokenId, {
      isActive: false,
      revokedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Validate an access token for API use.
 * Called by the /api/token/variables route.
 * Returns scoping info if valid.
 */
export const validateAccessToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("accessTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!record) {
      return { valid: false, error: "Token not found" } as const;
    }

    if (!record.isActive) {
      return { valid: false, error: "Token has been revoked" } as const;
    }

    if (record.expiresAt < Date.now()) {
      return { valid: false, error: "Token has expired" } as const;
    }

    return {
      valid: true,
      tokenId: record._id,
      userId: record.userId,
      organizationId: record.organizationId,
      projectIds: record.projectIds,
      environments: record.environments,
    } as const;
  },
});

/**
 * Update lastUsedAt — called fire-and-forget from API routes.
 */
export const updateLastUsed = mutation({
  args: {
    tokenId: v.id("accessTokens"),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.tokenId);
    if (record) {
      await ctx.db.patch(args.tokenId, { lastUsedAt: Date.now() });
    }
  },
});
