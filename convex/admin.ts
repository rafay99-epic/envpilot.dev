import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ==========================================
// HELPERS
// ==========================================

function verifyAdmin(secret: string) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || secret !== adminSecret) {
    throw new Error("Unauthorized: Invalid admin secret");
  }
}

const BROWSABLE_TABLES = [
  "users",
  "userPreferences",
  "organizations",
  "organizationMembers",
  "organizationTiers",
  "projects",
  "favoriteProjects",
  "projectMembers",
  "environmentVariables",
  "environmentVariableRequests",
  "variableVersions",
  "variablePermissions",
  "projectAccess",
  "invitations",
  "featureRequests",
  "featureVotes",
  "changelog",
  "auditLogs",
  "subscriptions",
  "stripeCustomers",
  "cliSessions",
  "cliTokens",
  "environmentTemplates",
  "templateVariables",
  "permissionRevocationEvents",
  "supportTickets",
  "contactMessages",
  "tierConfig",
  "adminSettings",
] as const;

// ==========================================
// AUTH
// ==========================================

export const verifySecret = query({
  args: { secret: v.string() },
  handler: async (_ctx, args) => {
    const adminSecret = process.env.ADMIN_SECRET;
    return { valid: !!adminSecret && args.secret === adminSecret };
  },
});

// ==========================================
// DASHBOARD
// ==========================================

export const getStats = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const users = await ctx.db.query("users").collect();
    const organizations = await ctx.db.query("organizations").collect();
    const projects = await ctx.db.query("projects").collect();

    const unreadMessages = await ctx.db
      .query("contactMessages")
      .withIndex("by_is_read", (q) => q.eq("isRead", false))
      .collect();

    const openTickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    const featureRequests = await ctx.db.query("featureRequests").collect();
    const featureRequestsByStatus: Record<string, number> = {};
    for (const fr of featureRequests) {
      featureRequestsByStatus[fr.status] =
        (featureRequestsByStatus[fr.status] || 0) + 1;
    }

    const orgTiers = await ctx.db.query("organizationTiers").collect();
    const tierDistribution = { free: 0, pro: 0 };
    for (const ot of orgTiers) {
      if (ot.tier === "free") tierDistribution.free++;
      else if (ot.tier === "pro") tierDistribution.pro++;
    }

    return {
      totalUsers: users.length,
      totalOrganizations: organizations.length,
      totalProjects: projects.length,
      unreadMessages: unreadMessages.length,
      openTickets: openTickets.length,
      totalFeatureRequests: featureRequests.length,
      featureRequestsByStatus,
      tierDistribution,
    };
  },
});

// ==========================================
// TIERS
// ==========================================

export const listOrganizationTiers = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const tiers = await ctx.db.query("organizationTiers").collect();

    const results = [];
    for (const tierRecord of tiers) {
      const org = await ctx.db.get(tierRecord.organizationId);

      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", tierRecord.organizationId)
        )
        .collect();

      const projects = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", tierRecord.organizationId)
        )
        .collect();

      results.push({
        ...tierRecord,
        organizationName: org?.name ?? "Unknown",
        organizationSlug: org?.slug ?? "unknown",
        memberCount: members.length,
        projectCount: projects.length,
      });
    }

    return results;
  },
});

export const updateOrganizationTier = mutation({
  args: {
    secret: v.string(),
    organizationId: v.id("organizations"),
    newTier: v.union(v.literal("free"), v.literal("pro")),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const tierRecord = await ctx.db
      .query("organizationTiers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    if (!tierRecord) {
      throw new Error("Tier record not found for this organization");
    }

    await ctx.db.patch(tierRecord._id, {
      tier: args.newTier,
      updatedAt: Date.now(),
    });
  },
});

// ==========================================
// MESSAGES
// ==========================================

export const listContactMessages = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("contactMessages")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const markContactMessageRead = mutation({
  args: {
    secret: v.string(),
    id: v.id("contactMessages"),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, { isRead: args.isRead });
  },
});

export const deleteContactMessage = mutation({
  args: {
    secret: v.string(),
    id: v.id("contactMessages"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.delete(args.id);
  },
});

// ==========================================
// TICKETS
// ==========================================

export const listSupportTickets = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("supportTickets")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const updateSupportTicketStatus = mutation({
  args: {
    secret: v.string(),
    id: v.id("supportTickets"),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed")
    ),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// ==========================================
// USERS
// ==========================================

export const listUsers = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const users = await ctx.db.query("users").collect();

    const results = [];
    for (const user of users) {
      const memberships = await ctx.db
        .query("organizationMembers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      results.push({
        ...user,
        organizationCount: memberships.length,
      });
    }

    return results;
  },
});

export const banUser = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    banReason: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    await ctx.db.patch(args.userId, {
      isBanned: true,
      bannedAt: Date.now(),
      bannedBy: "admin",
      banReason: args.banReason,
    });

    // Revoke all active CLI tokens for this user
    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    for (const token of cliTokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
        revokedAt: Date.now(),
      });
    }

    // Revoke all active extension sessions (projectAccess) for this user
    const extensionSessions = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const session of extensionSessions) {
      if (session.isActive) {
        await ctx.db.patch(session._id, { isActive: false });
      }
    }
  },
});

export const unbanUser = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    await ctx.db.patch(args.userId, {
      isBanned: false,
      bannedAt: undefined,
      bannedBy: undefined,
      banReason: undefined,
    });
  },
});

// ==========================================
// ORGANIZATIONS
// ==========================================

export const listOrganizations = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const organizations = await ctx.db.query("organizations").collect();

    const results = [];
    for (const org of organizations) {
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", org._id)
        )
        .collect();

      const projects = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", org._id)
        )
        .collect();

      const tierRecord = await ctx.db
        .query("organizationTiers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", org._id)
        )
        .first();

      results.push({
        ...org,
        memberCount: members.length,
        projectCount: projects.length,
        tier: tierRecord?.tier ?? "free",
      });
    }

    return results;
  },
});

export const getOrganizationDetail = query({
  args: {
    secret: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const members = [];
    for (const membership of memberships) {
      const user = await ctx.db.get(membership.userId);
      members.push({
        ...membership,
        user: user
          ? {
              _id: user._id,
              email: user.email,
              name: user.name,
              avatarUrl: user.avatarUrl,
              isBanned: user.isBanned,
            }
          : null,
      });
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const tierRecord = await ctx.db
      .query("organizationTiers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    return {
      ...org,
      members,
      projects,
      tier: tierRecord?.tier ?? "free",
    };
  },
});

// ==========================================
// CHANGELOG
// ==========================================

export const listAllChangelog = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db.query("changelog").order("desc").collect();
  },
});

export const createChangelog = mutation({
  args: {
    secret: v.string(),
    title: v.string(),
    content: v.string(),
    version: v.string(),
    type: v.union(
      v.literal("feature"),
      v.literal("fix"),
      v.literal("improvement"),
      v.literal("security"),
      v.literal("breaking")
    ),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const now = Date.now();
    const isPublished = args.isPublished ?? false;

    return await ctx.db.insert("changelog", {
      title: args.title,
      content: args.content,
      version: args.version,
      type: args.type,
      isPublished,
      publishedAt: isPublished ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateChangelog = mutation({
  args: {
    secret: v.string(),
    id: v.id("changelog"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    version: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("feature"),
        v.literal("fix"),
        v.literal("improvement"),
        v.literal("security"),
        v.literal("breaking")
      )
    ),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.content !== undefined) updates.content = args.content;
    if (args.version !== undefined) updates.version = args.version;
    if (args.type !== undefined) updates.type = args.type;

    await ctx.db.patch(args.id, updates);
  },
});

export const toggleChangelogPublish = mutation({
  args: {
    secret: v.string(),
    id: v.id("changelog"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const entry = await ctx.db.get(args.id);
    if (!entry) {
      throw new Error("Changelog entry not found");
    }

    const newPublished = !entry.isPublished;
    await ctx.db.patch(args.id, {
      isPublished: newPublished,
      publishedAt: newPublished ? Date.now() : entry.publishedAt,
      updatedAt: Date.now(),
    });
  },
});

export const deleteChangelog = mutation({
  args: {
    secret: v.string(),
    id: v.id("changelog"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.delete(args.id);
  },
});

// ==========================================
// TIER CONFIG
// ==========================================

export const getTierConfig = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const freeConfig = await ctx.db
      .query("tierConfig")
      .withIndex("by_tier", (q) => q.eq("tier", "free"))
      .first();

    const proConfig = await ctx.db
      .query("tierConfig")
      .withIndex("by_tier", (q) => q.eq("tier", "pro"))
      .first();

    return {
      free: freeConfig ?? null,
      pro: proConfig ?? null,
    };
  },
});

export const updateTierConfig = mutation({
  args: {
    secret: v.string(),
    tier: v.union(v.literal("free"), v.literal("pro")),
    maxProjects: v.optional(v.union(v.number(), v.null())),
    maxVariablesPerProject: v.optional(v.union(v.number(), v.null())),
    maxTeamMembers: v.optional(v.union(v.number(), v.null())),
    maxOrganizations: v.optional(v.union(v.number(), v.null())),
    auditLogRetentionDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const existing = await ctx.db
      .query("tierConfig")
      .withIndex("by_tier", (q) => q.eq("tier", args.tier))
      .first();

    const data: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.maxProjects !== undefined) data.maxProjects = args.maxProjects;
    if (args.maxVariablesPerProject !== undefined)
      data.maxVariablesPerProject = args.maxVariablesPerProject;
    if (args.maxTeamMembers !== undefined)
      data.maxTeamMembers = args.maxTeamMembers;
    if (args.maxOrganizations !== undefined)
      data.maxOrganizations = args.maxOrganizations;
    if (args.auditLogRetentionDays !== undefined)
      data.auditLogRetentionDays = args.auditLogRetentionDays;

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("tierConfig", {
        tier: args.tier,
        ...data,
        updatedAt: Date.now(),
      } as any);
    }
  },
});

// ==========================================
// FEATURE REQUESTS
// ==========================================

export const listFeatureRequests = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("featureRequests")
      .withIndex("by_vote_count")
      .order("desc")
      .collect();
  },
});

export const updateFeatureRequestStatus = mutation({
  args: {
    secret: v.string(),
    id: v.id("featureRequests"),
    status: v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const updateFeatureRequestAdminNotes = mutation({
  args: {
    secret: v.string(),
    id: v.id("featureRequests"),
    adminNotes: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, { adminNotes: args.adminNotes });
  },
});

export const deleteFeatureRequest = mutation({
  args: {
    secret: v.string(),
    id: v.id("featureRequests"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Delete all associated votes first
    const votes = await ctx.db
      .query("featureVotes")
      .withIndex("by_feature_request", (q) =>
        q.eq("featureRequestId", args.id)
      )
      .collect();

    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }

    // Delete the feature request
    await ctx.db.delete(args.id);
  },
});

// ==========================================
// MIGRATIONS
// ==========================================

export const listMigrations = query({
  args: { secret: v.string() },
  handler: async (_ctx, args) => {
    verifyAdmin(args.secret);
    return [] as Array<{ name: string; description: string }>;
  },
});

export const runMigration = mutation({
  args: {
    secret: v.string(),
    name: v.string(),
  },
  handler: async (_ctx, args) => {
    verifyAdmin(args.secret);
    throw new Error(`Unknown migration: ${args.name}`);
  },
});

// ==========================================
// DATA BROWSER
// ==========================================

export const browseTable = query({
  args: {
    secret: v.string(),
    tableName: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    if (
      !BROWSABLE_TABLES.includes(args.tableName as (typeof BROWSABLE_TABLES)[number])
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }

    const rows = await (ctx.db.query(args.tableName as any) as any)
      .order("desc")
      .take(100);

    return rows;
  },
});

export const updateTableRow = mutation({
  args: {
    secret: v.string(),
    tableName: v.string(),
    id: v.string(),
    fields: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    if (
      !BROWSABLE_TABLES.includes(args.tableName as (typeof BROWSABLE_TABLES)[number])
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }

    const parsedFields = JSON.parse(args.fields);
    const doc = await ctx.db.get(args.id as any);
    if (!doc) {
      throw new Error("Document not found");
    }

    await ctx.db.patch(args.id as any, parsedFields);
  },
});

export const deleteTableRow = mutation({
  args: {
    secret: v.string(),
    tableName: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    if (
      !BROWSABLE_TABLES.includes(args.tableName as (typeof BROWSABLE_TABLES)[number])
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }

    const doc = await ctx.db.get(args.id as any);
    if (!doc) {
      throw new Error("Document not found");
    }

    await ctx.db.delete(args.id as any);
  },
});

// ==========================================
// ADMIN SETTINGS
// ==========================================

export const getAdminSettings = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const settings = await ctx.db.query("adminSettings").collect();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  },
});

export const updateAdminSetting = mutation({
  args: {
    secret: v.string(),
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("adminSettings", {
        key: args.key,
        value: args.value,
        updatedAt: Date.now(),
      });
    }
  },
});

// ==========================================
// ENHANCED ANALYTICS
// ==========================================

export const getAnalytics = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Get all users with creation times for growth chart
    const users = await ctx.db.query("users").collect();
    const organizations = await ctx.db.query("organizations").collect();
    const projects = await ctx.db.query("projects").collect();

    // Messages and tickets
    const contactMessages = await ctx.db.query("contactMessages").collect();
    const supportTickets = await ctx.db.query("supportTickets").collect();

    // Feature requests
    const featureRequests = await ctx.db.query("featureRequests").collect();

    // Tiers
    const orgTiers = await ctx.db.query("organizationTiers").collect();

    // Build monthly growth data for last 12 months
    const now = Date.now();
    const months: Array<{ label: string; timestamp: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      months.push({
        label: d.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        timestamp: d.getTime(),
      });
    }

    // End boundary: start of next month
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(1);
    endDate.setHours(0, 0, 0, 0);
    const endTimestamp = endDate.getTime();

    function countByMonth(
      items: Array<{ createdAt?: number; _creationTime: number }>
    ) {
      return months.map((month, i) => {
        const start = month.timestamp;
        const end =
          i < months.length - 1 ? months[i + 1].timestamp : endTimestamp;
        return items.filter((item) => {
          const t = item.createdAt ?? item._creationTime;
          return t >= start && t < end;
        }).length;
      });
    }

    function cumulativeByMonth(
      items: Array<{ createdAt?: number; _creationTime: number }>
    ) {
      const monthly = countByMonth(items);
      const cumulative: number[] = [];
      // Count items before the first month
      let total = items.filter((item) => {
        const t = item.createdAt ?? item._creationTime;
        return t < months[0].timestamp;
      }).length;
      for (const count of monthly) {
        total += count;
        cumulative.push(total);
      }
      return cumulative;
    }

    // Ticket status distribution
    const ticketStatusCounts: Record<string, number> = {};
    for (const t of supportTickets) {
      ticketStatusCounts[t.status] =
        (ticketStatusCounts[t.status] || 0) + 1;
    }

    // Feature request status distribution
    const featureStatusCounts: Record<string, number> = {};
    for (const fr of featureRequests) {
      featureStatusCounts[fr.status] =
        (featureStatusCounts[fr.status] || 0) + 1;
    }

    // Ticket category distribution
    const ticketCategoryCounts: Record<string, number> = {};
    for (const t of supportTickets) {
      ticketCategoryCounts[t.category] =
        (ticketCategoryCounts[t.category] || 0) + 1;
    }

    // Tier distribution
    const tierDistribution = { free: 0, pro: 0 };
    for (const ot of orgTiers) {
      if (ot.tier === "free") tierDistribution.free++;
      else if (ot.tier === "pro") tierDistribution.pro++;
    }

    // Messages read/unread
    const messagesRead = contactMessages.filter((m) => m.isRead).length;
    const messagesUnread = contactMessages.filter((m) => !m.isRead).length;

    // Top feature requests by votes
    const topFeatureRequests = [...featureRequests]
      .sort((a, b) => b.voteCount - a.voteCount)
      .slice(0, 10)
      .map((fr) => ({
        title: fr.title,
        votes: fr.voteCount,
        status: fr.status,
      }));

    // Recent activity: last 30 days counts
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentUsers = users.filter(
      (u) => (u.createdAt ?? u._creationTime) >= thirtyDaysAgo
    ).length;
    const recentOrgs = organizations.filter(
      (o) => o.createdAt >= thirtyDaysAgo
    ).length;
    const recentProjects = projects.filter(
      (p) => p.createdAt >= thirtyDaysAgo
    ).length;
    const recentTickets = supportTickets.filter(
      (t) => t.createdAt >= thirtyDaysAgo
    ).length;

    return {
      monthLabels: months.map((m) => m.label),
      userGrowth: cumulativeByMonth(users),
      orgGrowth: cumulativeByMonth(organizations),
      projectGrowth: cumulativeByMonth(projects),
      newUsersPerMonth: countByMonth(users),
      newOrgsPerMonth: countByMonth(organizations),
      ticketsPerMonth: countByMonth(supportTickets),
      messagesPerMonth: countByMonth(contactMessages),
      tierDistribution,
      ticketStatusCounts,
      ticketCategoryCounts,
      featureStatusCounts,
      messagesRead,
      messagesUnread,
      topFeatureRequests,
      recent30d: {
        users: recentUsers,
        organizations: recentOrgs,
        projects: recentProjects,
        tickets: recentTickets,
      },
    };
  },
});
