import { v } from "convex/values";
import { internalMutation, mutation, query } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { getAuthedUser, requireAuthedUser } from "../../lib/identity";
import { getRoleProfile, hasCapability } from "../../lib/authz";
import { mcpKeysRetired } from "../../lib/mcpRetirement";

/**
 * Who hears about the MCP OAuth migration, and how. `startNotices` runs once,
 * the first time an admin turns the migration on (admin/settings.ts):
 *
 *   buildNotices  pages through apiKeys, one notice row per person who
 *                 manages a key MCP accepted
 *   sendEmails    mails each of them once, spaced out for Resend's rate limit
 *
 * The dashboard card reads `status` and disappears for good on `dismiss`.
 */

const KEYS_PER_PAGE = 100;
const EMAILS_PER_BATCH = 50;
// Resend allows a couple of sends a second; space them out.
const EMAIL_SPACING_MS = 600;
const MAX_KEYS_PER_NOTICE = 20;

/**
 * The key's creator while they are an active member, otherwise everyone
 * whose role can manage API keys, so a key whose owner left still reaches
 * someone.
 */
async function recipientsFor(
  ctx: MutationCtx,
  key: Doc<"apiKeys">,
  managersByOrg: Map<Id<"organizations">, Id<"users">[]>
): Promise<Id<"users">[]> {
  const creator = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", key.organizationId).eq("userId", key.createdBy)
    )
    .first();
  if (creator && creator.status !== "suspended") return [key.createdBy];

  const cached = managersByOrg.get(key.organizationId);
  if (cached) return cached;
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", key.organizationId)
    )
    .take(500);
  const managers: Id<"users">[] = [];
  for (const member of members) {
    if (member.status === "suspended") continue;
    const profile = await getRoleProfile(ctx, member.role);
    if (hasCapability(profile, "org.api_keys")) managers.push(member.userId);
  }
  managersByOrg.set(key.organizationId, managers);
  return managers;
}

export const buildNotices = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db
      .query("apiKeys")
      .paginate({ cursor: args.cursor, numItems: KEYS_PER_PAGE });
    const orgNames = new Map<Id<"organizations">, string | null>();
    const managersByOrg = new Map<Id<"organizations">, Id<"users">[]>();

    for (const key of page.page) {
      const live =
        key.revokedAt === undefined &&
        (key.expiresAt === undefined || key.expiresAt > now);
      // Keys minted before surfaces existed work everywhere, MCP included.
      const reachesMcp =
        key.surfaces === undefined || key.surfaces.includes("mcp_server");
      if (!live || !reachesMcp) continue;

      if (!orgNames.has(key.organizationId)) {
        const org = await ctx.db.get(key.organizationId);
        orgNames.set(key.organizationId, org?.name ?? null);
      }
      const orgName = orgNames.get(key.organizationId);
      if (!orgName) continue;
      const label = `${key.name} · ${orgName}`;

      for (const userId of await recipientsFor(ctx, key, managersByOrg)) {
        const notice = await ctx.db
          .query("mcpRetirementNotices")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
        if (!notice) {
          await ctx.db.insert("mcpRetirementNotices", {
            userId,
            keys: [label],
          });
        } else if (
          notice.keys.length < MAX_KEYS_PER_NOTICE &&
          !notice.keys.includes(label)
        ) {
          await ctx.db.patch(notice._id, { keys: [...notice.keys, label] });
        }
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.features.api.mcpRetirement.buildNotices,
        { cursor: page.continueCursor }
      );
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.features.api.mcpRetirement.sendEmails,
        {}
      );
    }
    return null;
  },
});

export const sendEmails = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("mcpRetirementNotices")
      .withIndex("by_emailed", (q) => q.eq("emailedAt", undefined))
      .take(EMAILS_PER_BATCH);

    for (const [index, notice] of pending.entries()) {
      // Marked first, so a failed send is never retried into a duplicate.
      await ctx.db.patch(notice._id, { emailedAt: now });
      const user = await ctx.db.get(notice.userId);
      if (!user?.email) continue;
      await ctx.scheduler.runAfter(
        index * EMAIL_SPACING_MS,
        internal.features.emails.emails.sendMcpRetirementEmail,
        { email: user.email, keys: notice.keys }
      );
    }

    if (pending.length === EMAILS_PER_BATCH) {
      await ctx.scheduler.runAfter(
        EMAILS_PER_BATCH * EMAIL_SPACING_MS,
        internal.features.api.mcpRetirement.sendEmails,
        {}
      );
    }
    return null;
  },
});

/**
 * Whether MCP is OAuth only, and the card to show the signed-in user: the
 * MCP keys they manage, until they press OK.
 */
export const status = query({
  args: {},
  returns: v.object({
    retired: v.boolean(),
    card: v.union(v.object({ keys: v.array(v.string()) }), v.null()),
  }),
  handler: async (ctx) => {
    // Nullable on purpose: the dashboard shell renders this before the
    // session token reaches Convex, and a throw there would blank the shell.
    const user = await getAuthedUser(ctx);
    const retired = await mcpKeysRetired(ctx.db);
    if (!retired || !user) return { retired, card: null };
    const notice = await ctx.db
      .query("mcpRetirementNotices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    return {
      retired,
      card:
        notice && notice.dismissedAt === undefined
          ? { keys: notice.keys }
          : null,
    };
  },
});

/** OK on the dashboard card. The card never comes back for this user. */
export const dismiss = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireAuthedUser(ctx);
    const notice = await ctx.db
      .query("mcpRetirementNotices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (notice && notice.dismissedAt === undefined) {
      await ctx.db.patch(notice._id, { dismissedAt: Date.now() });
    }
    return null;
  },
});
