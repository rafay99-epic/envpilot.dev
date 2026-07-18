import { query } from "../../_generated/server";
import { requireAdmin } from "./auth";

// Admin dashboard reads are reactive (re-run on every write to any of these
// tables platform-wide). This cap bounds worst-case read cost per render and
// keeps every table scan in this file below Convex's per-function read
// limit; it mirrors the existing users/organizations/projects cap below.
// True fix (denormalized counters / @convex-dev/aggregate) is a larger
// follow-up — see .frugal-fable/usage-audit/fixes-crons.md.
const ADMIN_DASHBOARD_SCAN_CAP = 10000;

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const users = await ctx.db.query("users").take(ADMIN_DASHBOARD_SCAN_CAP);
    const organizations = await ctx.db
      .query("organizations")
      .take(ADMIN_DASHBOARD_SCAN_CAP);
    const projects = await ctx.db
      .query("projects")
      .take(ADMIN_DASHBOARD_SCAN_CAP);

    const unreadMessages = await ctx.db
      .query("contactMessages")
      .withIndex("by_is_read", (q) => q.eq("isRead", false))
      .collect();

    const openTickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    const featureRequests = await ctx.db
      .query("featureRequests")
      .take(ADMIN_DASHBOARD_SCAN_CAP);
    const featureRequestsByStatus: Record<string, number> = {};
    for (const fr of featureRequests) {
      featureRequestsByStatus[fr.status] =
        (featureRequestsByStatus[fr.status] || 0) + 1;
    }

    const userTiers = await ctx.db
      .query("userTiers")
      .take(ADMIN_DASHBOARD_SCAN_CAP);
    const tierDistribution: Record<string, number> = {};
    for (const ut of userTiers) {
      tierDistribution[ut.tier] = (tierDistribution[ut.tier] || 0) + 1;
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

export const getPaymentReadiness = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const paymentProducts = await ctx.db.query("paymentProducts").collect();
    const tierDefinitions = await ctx.db.query("tierDefinitions").collect();
    const subscriptions = await ctx.db.query("subscriptions").collect();

    // Check which paid tiers have active payment products
    const paidTiers = tierDefinitions.filter((t) => !t.isDefault);
    const tiersWithProducts = paidTiers.map((tier) => {
      const product = paymentProducts.find(
        (p) => p.tierName === tier.name && p.provider === "polar" && p.isActive
      );
      return {
        tierName: tier.name,
        displayName: tier.displayName,
        hasActiveProduct: !!product,
        productId: product?.productId ?? null,
      };
    });

    const activeSubscriptions = subscriptions.filter(
      (s) => s.status === "active"
    );

    // Read current paymentsEnabled setting
    const setting = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", "paymentsEnabled"))
      .first();

    return {
      paymentsEnabled: setting?.value === "true",
      paymentProductsSeeded: paymentProducts.length > 0,
      tiersWithProducts,
      allPaidTiersConfigured: tiersWithProducts.every(
        (t) => t.hasActiveProduct
      ),
      activeSubscriptionCount: activeSubscriptions.length,
      canEnable: tiersWithProducts.some((t) => t.hasActiveProduct),
    };
  },
});

export const getAnalytics = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Get all users with creation times for growth chart
    const users = await ctx.db.query("users").take(ADMIN_DASHBOARD_SCAN_CAP);
    const organizations = await ctx.db
      .query("organizations")
      .take(ADMIN_DASHBOARD_SCAN_CAP);
    const projects = await ctx.db
      .query("projects")
      .take(ADMIN_DASHBOARD_SCAN_CAP);

    // Messages and tickets
    const contactMessages = await ctx.db
      .query("contactMessages")
      .take(ADMIN_DASHBOARD_SCAN_CAP);
    const supportTickets = await ctx.db
      .query("supportTickets")
      .take(ADMIN_DASHBOARD_SCAN_CAP);

    // Feature requests
    const featureRequests = await ctx.db
      .query("featureRequests")
      .take(ADMIN_DASHBOARD_SCAN_CAP);

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
      ticketStatusCounts[t.status] = (ticketStatusCounts[t.status] || 0) + 1;
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

    // Tier distribution — user-level
    const userTiers = await ctx.db.query("userTiers").take(5000);
    const tierDistribution: Record<string, number> = {};
    for (const ut of userTiers) {
      tierDistribution[ut.tier] = (tierDistribution[ut.tier] || 0) + 1;
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
