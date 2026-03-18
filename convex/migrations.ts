import { internalMutation } from "./_generated/server";

/**
 * One-time migration: Move `tier` from organizations table to organizationTiers table.
 *
 * Prerequisites:
 *   - schema.ts must have `tier: v.optional(...)` on organizations (temporary)
 *   - schema.ts must have the organizationTiers table defined
 *
 * After running successfully:
 *   1. Remove the `tier` field from organizations in schema.ts
 *   2. Redeploy / push schema
 *
 * Run via: npx convex run migrations:migrateTierToSeparateTable
 */
export const migrateTierToSeparateTable = internalMutation({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();

    let migrated = 0;
    let skipped = 0;
    let tierFieldsRemoved = 0;

    for (const org of organizations) {
      // Check if this org already has a tier record
      const existingTier = await ctx.db
        .query("organizationTiers")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .first();

      if (!existingTier) {
        // Read the old tier value — defaults to "free" if missing
        const oldTier = org.tier === "pro" ? "pro" : "free";

        // Create the organizationTiers record
        await ctx.db.insert("organizationTiers", {
          organizationId: org._id,
          tier: oldTier,
          updatedAt: Date.now(),
          reason: "migration_from_organizations_table",
        });
        migrated++;
      } else {
        skipped++;
      }

      // Remove the tier field from the organization document
      if (org.tier !== undefined) {
        await ctx.db.patch(org._id, { tier: undefined });
        tierFieldsRemoved++;
      }
    }

    return {
      total: organizations.length,
      migrated,
      skipped,
      tierFieldsRemoved,
    };
  },
});
