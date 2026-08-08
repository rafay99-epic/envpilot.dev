import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";
import { normalizeOrgRole } from "../../lib/authz";
import { SEED_CHANGELOG } from "../community/changelog/seed";
import { SEED_FEATURE_REQUESTS } from "../community/featureRequests/seed";
import { SEED_FEATURES, SEED_ROLES } from "../../lib/seedData";
import { mergeSystemRoleCapabilities } from "../../lib/roleProfiles";
import { requireAdmin } from "./auth";

export const listMigrations = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return [
      // ── Feature & Tier System (run when adding features or updating tiers) ──
      {
        name: "seed-feature-registry",
        description:
          "Seeds all gatable features into the featureRegistry table. Idempotent — skips existing keys.",
        category: "Feature & Tier System",
        priority: 1,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-tier-features",
        description:
          "Seeds default tier-feature overrides for free and pro tiers. Idempotent — skips existing overrides.",
        category: "Feature & Tier System",
        priority: 2,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-tier-definitions",
        description:
          "Seeds or updates default 'free' and 'pro' tier definitions (upsert). Safe to run multiple times — updates existing tiers with latest pricing and display fields.",
        category: "Feature & Tier System",
        priority: 3,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-role-registry",
        description:
          "Seeds the role registry from SEED_ROLES: system-role metadata and levels sync from code; system capability matrices MERGE (new code defaults fill in, admin edits survive) except owner, which stays fully code-synced. Seeded custom roles (editor/viewer) keep their admin-owned METADATA after the first seed, but their capability maps merge the same way system roles do — a newly shipped capability fills in, every explicit admin choice survives. Idempotent.",
        category: "Feature & Tier System",
        priority: 4,
        destructive: false,
        runOnce: false,
      },
      {
        name: "migrate-roles",
        description:
          "Role-registry migration: normalizes surviving legacy role values (admin→owner, member→developer) on organizationMembers and pending invitations, then VERIFIES every stored role slug resolves in the registry. Reports anomalies without changing them. Idempotent.",
        category: "Feature & Tier System",
        priority: 5,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-payment-products",
        description:
          "Seeds payment product mappings from tierDefinitions.polarProductId into the paymentProducts table. Idempotent — skips existing mappings.",
        category: "Feature & Tier System",
        priority: 4,
        destructive: false,
        runOnce: false,
      },

      // ── Content Seeding ──
      {
        name: "seed-changelog",
        description:
          "Seeds all historical changelog entries (v0.1.0 through v1.51.0). Idempotent — skips entries that already exist, removes duplicates. Safe to run multiple times.",
        category: "Content Seeding",
        priority: 1,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-feature-requests",
        description:
          "Seeds planned team features into the featureRequests table from FEATURES.md reference. Idempotent — skips entries that already exist by title. Safe to run multiple times.",
        category: "Content Seeding",
        priority: 2,
        destructive: false,
        runOnce: false,
      },

      // ── Destructive / Reset ──
      {
        name: "clear-changelog",
        description:
          "Deletes ALL changelog entries from the database. Use before re-seeding or to start fresh.",
        category: "Destructive",
        priority: 1,
        destructive: true,
        runOnce: false,
      },
      {
        name: "clear-feature-requests",
        description:
          "Deletes ALL feature requests and their votes from the database.",
        category: "Destructive",
        priority: 2,
        destructive: true,
        runOnce: false,
      },

      // ── One-Time Migrations ──
      {
        name: "migrate-phase6",
        description:
          "Phase 6 migration: strips legacy limits/features from tierDefinitions, migrates organizationTiers to userTiers, backfills userId on subscriptions. Run ONCE after deploying Phase 6 schema.",
        category: "One-Time Migrations",
        priority: 1,
        destructive: false,
        runOnce: true,
      },
      {
        name: "migrate-unified-roles",
        description:
          "Migrates legacy roles to the unified 4-role system: admin→owner, team_lead→project_manager, member→developer (or team_lead if they managed a project); pending invitations migrate the same way; variable permission admin→write. Then backfills a read grant for every developer on every variable in their assigned projects so no existing user loses visibility. Idempotent — safe to re-run.",
        category: "One-Time Migrations",
        priority: 2,
        destructive: false,
        runOnce: true,
      },
      {
        name: "cleanup-dead-data",
        description:
          "Drains legacy data left behind by the backend cleanup: unsets the removed `settings` field (the dead teamLeadsCanCreateProjects toggle) on all organizations and deletes any orphaned usageCounters rows. Bounded to 500 writes per run and idempotent — re-run until it reports 0 remaining, after which both schema declarations can be dropped in a later PR.",
        category: "One-Time Migrations",
        priority: 3,
        destructive: false,
        runOnce: true,
      },
      {
        name: "backfill-doc-content-status",
        description:
          "Backfills docContent.status from the parent doc for body rows written before the field existed — without it those pages can never match a published-only body search. Bounded to 200 rows per run; re-run while it reports hadMore: true.",
        category: "One-Time Migrations",
        priority: 4,
        destructive: false,
        runOnce: true,
      },
    ] as Array<{
      name: string;
      description: string;
      category: string;
      priority: number;
      destructive: boolean;
      runOnce: boolean;
    }>;
  },
});

export const runMigration = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return runMigrationByName(ctx, args.name);
  },
});

/**
 * CI seed entrypoint — internal, so it is callable only with the deploy key
 * (`bunx convex run features/admin/migrations:run '{"name": "..."}'`), never
 * from clients. The admin UI goes through `runMigration` (identity-gated).
 */
export const run = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => runMigrationByName(ctx, args.name),
});

async function runMigrationByName(ctx: MutationCtx, name: string) {
  // Keeps the original `args.name` references below working untouched.
  const args = { name };

  if (args.name === "seed-tier-definitions") {
    const existing = await ctx.db.query("tierDefinitions").collect();
    const existingByName = new Map(existing.map((t) => [t.name, t]));
    const now = Date.now();

    const seedData = [
      {
        name: "free",
        displayName: "Free",
        description: "Basic tier with limited resources",
        sortOrder: 0,
        isDefault: true,
        color: "#71717a",
        polarProductId: "35d0b155-c28a-4cca-a5cf-bbb14f6ab23c",
        monthlyPrice: 0,
        badge: "Free forever",
        badgeColor: "green",
        ctaText: "Get Started Free",
        ctaLink: "/sign-up",
        isComingSoon: false,
        highlightFeatures: [
          "Up to 3 projects",
          "50 variables per project",
          "Up to 3 team members",
          "CLI + VS Code Extension",
          "Web Dashboard",
          "AES-256 encrypted vault",
          "Role-based access control",
          "7-day audit log retention",
        ],
      },
      {
        name: "pro",
        displayName: "Pro",
        description: "Professional tier with unlimited resources",
        sortOrder: 1,
        isDefault: false,
        color: "#a855f7",
        polarProductId: "d1edde6d-3201-4cec-b1e4-e053d7edba23",
        monthlyPrice: 15,
        badge: "Pro",
        badgeColor: "green",
        ctaText: "Upgrade to Pro",
        ctaLink: "/api/checkout?tier=pro",
        isComingSoon: false,
        highlightFeatures: [
          "Unlimited projects",
          "Unlimited variables",
          "Unlimited team members",
          "Version history & rollback",
          "Bulk .env import",
          "Granular permissions",
          "Secret rotation & expiry",
          "365-day audit log retention",
          "Priority support",
        ],
      },
    ];

    let created = 0;
    let updated = 0;
    for (const tier of seedData) {
      const found = existingByName.get(tier.name);
      if (found) {
        // polarProductId is DEPLOYMENT-SPECIFIC billing config, entered
        // per-environment through the admin panel (dev sandbox product vs
        // production product). The seed value is only a dev-convenience
        // default for brand-new rows — a blind patch here would clobber
        // the production product id on every re-seed and break checkout/
        // activation until re-entered.
        const { polarProductId: _seedDefault, ...seedWithoutBillingConfig } =
          tier;
        await ctx.db.patch(found._id, {
          ...seedWithoutBillingConfig,
          updatedAt: now,
        });
        updated++;
      } else {
        await ctx.db.insert("tierDefinitions", {
          ...tier,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }

    return {
      success: true,
      total: seedData.length,
      migrated: created,
      updated,
      skipped: 0,
    };
  }

  if (args.name === "seed-feature-registry") {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const now = Date.now();

    for (const f of SEED_FEATURES) {
      const existing = await ctx.db
        .query("featureRegistry")
        .withIndex("by_key", (q: any) => q.eq("key", f.key))
        .first();
      if (existing) {
        // Update if properties have drifted
        const needsUpdate =
          existing.displayName !== f.displayName ||
          existing.valueType !== f.valueType ||
          existing.category !== f.category ||
          existing.defaultValue !== f.defaultValue ||
          existing.resettable !== f.resettable ||
          existing.sortOrder !== f.sortOrder;

        if (needsUpdate) {
          await ctx.db.patch(existing._id, {
            displayName: f.displayName,
            valueType: f.valueType,
            category: f.category,
            defaultValue: f.defaultValue,
            resettable: f.resettable,
            sortOrder: f.sortOrder,
            updatedAt: now,
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      await ctx.db.insert("featureRegistry", {
        ...f,
        description: undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return {
      success: true,
      total: SEED_FEATURES.length,
      migrated: created,
      updated,
      skipped,
    };
  }

  if (args.name === "seed-role-registry") {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    // Merge semantics make default changes invisible on drifted rows —
    // this report is the visibility: for every system role, the keys
    // whose stored value differs from the current code default.
    const drift: Record<string, string[]> = {};
    const now = Date.now();

    for (const role of SEED_ROLES) {
      const existing = await ctx.db
        .query("roleRegistry")
        .withIndex("by_slug", (q: any) => q.eq("slug", role.slug))
        .first();

      if (existing) {
        if (role.isSystem) {
          // System roles: code owns level and metadata on every run. The
          // capability matrix MERGES (except owner, which stays fully
          // code-synced): keys the stored row already has keep their
          // stored value — admin-panel edits survive deploys — while new
          // code defaults fill in keys the row has never seen.
          const targetCaps =
            role.slug === "owner"
              ? (role.capabilities as Record<string, boolean>)
              : (mergeSystemRoleCapabilities(
                  role.capabilities,
                  existing.capabilities as Record<string, boolean>
                ) as Record<string, boolean>);
          const defaults = role.capabilities as Record<string, boolean>;
          const driftKeys = [
            ...new Set([...Object.keys(defaults), ...Object.keys(targetCaps)]),
          ].filter((k) => (targetCaps[k] === true) !== (defaults[k] === true));
          if (driftKeys.length > 0) drift[role.slug] = driftKeys.sort();
          const normalizeCaps = (caps: Record<string, boolean>) =>
            JSON.stringify(
              Object.keys(caps)
                .sort()
                .map((k) => [k, caps[k]])
            );
          const capsChanged =
            normalizeCaps(existing.capabilities as Record<string, boolean>) !==
            normalizeCaps(targetCaps);
          const needsUpdate =
            capsChanged ||
            existing.displayName !== role.displayName ||
            existing.description !== role.description ||
            existing.color !== role.color ||
            existing.level !== role.level ||
            existing.isSystem !== true ||
            existing.sortOrder !== role.sortOrder;
          if (needsUpdate) {
            await ctx.db.patch(existing._id, {
              displayName: role.displayName,
              description: role.description,
              color: role.color,
              level: role.level,
              isSystem: true,
              sortOrder: role.sortOrder,
              capabilities: targetCaps,
              updatedAt: now,
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Seeded custom roles (editor/viewer): the admin panel owns their
          // METADATA after the first seed, but capabilities merge the same
          // way system roles do. Without this a newly shipped capability
          // never reaches an existing Editor row, so those users silently
          // lack the feature forever. Merge only fills keys the row has
          // never seen — every explicit admin choice is preserved.
          const mergedCaps = mergeSystemRoleCapabilities(
            role.capabilities,
            existing.capabilities as Record<string, boolean>
          ) as Record<string, boolean>;
          const normalize = (caps: Record<string, boolean>) =>
            JSON.stringify(
              Object.keys(caps)
                .sort()
                .map((k) => [k, caps[k]])
            );
          if (
            normalize(existing.capabilities as Record<string, boolean>) !==
            normalize(mergedCaps)
          ) {
            await ctx.db.patch(existing._id, {
              capabilities: mergedCaps,
              updatedAt: now,
            });
            updated++;
          } else {
            skipped++;
          }
        }
        continue;
      }

      await ctx.db.insert("roleRegistry", {
        slug: role.slug,
        displayName: role.displayName,
        description: role.description,
        color: role.color,
        level: role.level,
        isSystem: role.isSystem,
        isActive: true,
        sortOrder: role.sortOrder,
        capabilities: role.capabilities as Record<string, boolean>,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return {
      success: true,
      drift,
      created,
      updated,
      skipped,
      total: SEED_ROLES.length,
    };
  }

  if (args.name === "migrate-roles") {
    const now = Date.now();
    let normalizedMembers = 0;
    let normalizedInvitations = 0;
    const anomalies: string[] = [];

    // Registry slugs for verification
    const registryRows = await ctx.db.query("roleRegistry").collect();
    const activeSlugs = new Set(
      registryRows.filter((r: any) => r.isActive).map((r: any) => r.slug)
    );
    if (activeSlugs.size === 0) {
      return {
        success: false,
        error:
          "Role registry is empty — run seed-role-registry before migrate-roles.",
      };
    }

    const LEGACY_MAP: Record<string, string> = {
      admin: "owner",
      member: "developer",
    };

    const members = await ctx.db.query("organizationMembers").collect();
    for (const m of members) {
      const mapped = LEGACY_MAP[m.role];
      if (mapped) {
        await ctx.db.patch(m._id, { role: mapped });
        normalizedMembers++;
        continue;
      }
      if (!activeSlugs.has(m.role)) {
        anomalies.push(
          `organizationMembers ${m._id}: unknown role slug "${m.role}"`
        );
      }
    }

    const invitations = await ctx.db.query("invitations").collect();
    for (const inv of invitations) {
      if (inv.status !== "pending") continue;
      const mapped = LEGACY_MAP[inv.role];
      if (mapped) {
        await ctx.db.patch(inv._id, { role: mapped });
        normalizedInvitations++;
        continue;
      }
      if (!activeSlugs.has(inv.role)) {
        anomalies.push(
          `invitations ${inv._id}: unknown role slug "${inv.role}"`
        );
      }
    }

    // Anomalies are REPORTED, never auto-fixed: an unknown slug means a
    // member is fail-closed (zero capabilities) until a human decides.
    return {
      success: true,
      normalizedMembers,
      normalizedInvitations,
      anomalies,
      verifiedAt: now,
    };
  }

  if (args.name === "seed-tier-features") {
    const tierConfigs: Record<string, Record<string, string>> = {
      free: {
        max_projects: "3",
        max_variables_per_project: "50",
        max_organizations: "1",
        max_team_members: "3",
        max_invitations: "5",
        variable_version_history: "false",
        bulk_import: "false",
        bulk_delete: "true",
        bulk_export: "false",
        variable_tags: "true",
        api_access: "true",
        extension_access: "true",
        cli_access: "true",
        vscode_unsync_customization: "false",
        granular_permissions: "true",
        audit_log_retention_days: "7",
        sso_enabled: "false",
        public_api: "false",
        mcp_server: "false",
        team_notifications: "false",
        team_notifications_limit: "0",
        secret_rotation: "false",
        secret_rotation_limit: "7",
        secret_sharing: "false",
        security_hold: "false",
        max_active_shares: "0",
        shared_accounts: "true",
        shared_accounts_limit: "5",
        secret_files: "true",
        secret_files_limit: "3",
        secret_files_max_bytes: "262144",
        keyboard_shortcuts_custom: "true",
        custom_branding: "false",
        analytics_retention_days: "7",
        priority_support: "false",
        project_docs: "false",
      },
      pro: {
        max_projects: "null",
        max_variables_per_project: "null",
        max_organizations: "null",
        max_team_members: "null",
        max_invitations: "null",
        variable_version_history: "true",
        bulk_import: "true",
        bulk_delete: "true",
        bulk_export: "true",
        variable_tags: "true",
        api_access: "true",
        extension_access: "true",
        cli_access: "true",
        vscode_unsync_customization: "true",
        granular_permissions: "true",
        audit_log_retention_days: "365",
        sso_enabled: "false",
        public_api: "true",
        mcp_server: "true",
        team_notifications: "true",
        team_notifications_limit: "10",
        secret_rotation: "true",
        secret_rotation_limit: "null",
        secret_sharing: "true",
        security_hold: "true",
        max_active_shares: "null",
        shared_accounts: "true",
        shared_accounts_limit: "null",
        secret_files: "true",
        secret_files_limit: "null",
        secret_files_max_bytes: "8388608",
        keyboard_shortcuts_custom: "true",
        custom_branding: "true",
        analytics_retention_days: "30",
        priority_support: "true",
        project_docs: "true",
      },
    };

    let created = 0;
    let skipped = 0;

    for (const [tierName, features] of Object.entries(tierConfigs)) {
      for (const [featureKey, value] of Object.entries(features)) {
        const existing = await ctx.db
          .query("tierFeatures")
          .withIndex("by_tier_and_feature", (q: any) =>
            q.eq("tierName", tierName).eq("featureKey", featureKey)
          )
          .first();
        if (existing) {
          skipped++;
          continue;
        }
        await ctx.db.insert("tierFeatures", {
          tierName,
          featureKey,
          value,
          updatedAt: Date.now(),
        });
        created++;
      }
    }

    return {
      success: true,
      total: Object.values(tierConfigs).reduce(
        (sum, f) => sum + Object.keys(f).length,
        0
      ),
      migrated: created,
      skipped,
    };
  }

  if (args.name === "migrate-phase6") {
    const results = {
      tierDefsCleanedLimits: 0,
      tierDefsCleanedFeatures: 0,
      orgTiersMigrated: 0,
      orgTiersDeleted: 0,
      subscriptionsBackfilled: 0,
      polarCustomersBackfilled: 0,
    };

    const now = Date.now();

    // 1. Strip limits/features from tierDefinitions
    const tierDefs = await ctx.db.query("tierDefinitions").collect();
    for (const td of tierDefs) {
      const updates: Record<string, undefined> = {};
      if ((td as Record<string, unknown>).limits !== undefined) {
        updates.limits = undefined;
        results.tierDefsCleanedLimits++;
      }
      if ((td as Record<string, unknown>).features !== undefined) {
        updates.features = undefined;
        results.tierDefsCleanedFeatures++;
      }
      if ((td as Record<string, unknown>).dynamicFeatures !== undefined) {
        updates.dynamicFeatures = undefined;
        results.tierDefsCleanedLimits++;
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(td._id, updates);
      }
    }

    // 2. Migrate organizationTiers -> userTiers
    const orgTiers = await ctx.db.query("organizationTiers").collect();
    for (const ot of orgTiers) {
      const org = await ctx.db.get(ot.organizationId);
      if (org) {
        const existing = await ctx.db
          .query("userTiers")
          .withIndex("by_user", (q) => q.eq("userId", org.createdBy))
          .first();
        if (!existing) {
          await ctx.db.insert("userTiers", {
            userId: org.createdBy,
            tier: ot.tier,
            updatedAt: now,
            reason: "migration.phase6",
          });
          results.orgTiersMigrated++;
        }
      }
    }

    // 3. Delete all organizationTiers records
    for (const ot of orgTiers) {
      await ctx.db.delete(ot._id);
      results.orgTiersDeleted++;
    }

    // 4. Backfill userId on subscriptions
    const subs = await ctx.db.query("subscriptions").collect();
    for (const sub of subs) {
      if (!sub.userId) {
        const org = await ctx.db.get(sub.organizationId);
        if (org) {
          await ctx.db.patch(sub._id, { userId: org.createdBy });
          results.subscriptionsBackfilled++;
        }
      }
    }

    // 5. Backfill userId on polarCustomers
    const customers = await ctx.db.query("polarCustomers").collect();
    for (const sc of customers) {
      if (!sc.userId) {
        const org = await ctx.db.get(sc.organizationId);
        if (org) {
          await ctx.db.patch(sc._id, { userId: org.createdBy });
          results.polarCustomersBackfilled++;
        }
      }
    }

    return { success: true, ...results };
  }

  if (args.name === "seed-changelog") {
    let created = 0;
    let skipped = 0;
    let deduped = 0;
    const now = Date.now();

    for (const entry of SEED_CHANGELOG) {
      const existing = await ctx.db
        .query("changelog")
        .withIndex("by_version", (q: any) => q.eq("version", entry.version))
        .collect();

      const matches = existing.filter(
        (e: { title: string }) => e.title === entry.title
      );

      if (matches.length > 0) {
        // Keep first, delete any duplicates
        for (let i = 1; i < matches.length; i++) {
          await ctx.db.delete(matches[i]._id);
          deduped++;
        }
        skipped++;
        continue;
      }

      await ctx.db.insert("changelog", {
        title: entry.title,
        content: entry.content,
        version: entry.version,
        type: entry.type,
        isPublished: true,
        publishedAt: entry.publishedAt,
        createdAt: entry.publishedAt,
        updatedAt: now,
      });
      created++;
    }

    return {
      success: true,
      total: SEED_CHANGELOG.length,
      migrated: created,
      skipped,
      duplicatesRemoved: deduped,
    };
  }

  /**
   * Backfill `docContent.status` from the parent `docs` row.
   *
   * The body search index filters on `docContent.status`, so any row written
   * before that field existed carries `undefined` and can never match a
   * published-only search — the page would be silently unfindable by its own
   * text, with no error anywhere.
   *
   * Bounded per run — a body row holds up to 256KB, so an unbounded collect()
   * would blow the transaction read limit. Only rows still missing the field
   * are read, so every run makes progress: re-run until `hadMore` is false.
   */
  if (args.name === "backfill-doc-content-status") {
    const BATCH = 200;
    const rows = await ctx.db
      .query("docContent")
      .filter((q) => q.eq(q.field("status"), undefined))
      .take(BATCH);
    let updated = 0;
    let orphaned = 0;

    for (const row of rows) {
      const doc = await ctx.db.get(row.docId);
      if (!doc) {
        orphaned++;
        continue;
      }
      await ctx.db.patch(row._id, { status: doc.status });
      updated++;
    }

    return {
      success: true,
      total: rows.length,
      updated,
      orphaned,
      hadMore: rows.length === BATCH,
    };
  }

  if (args.name === "clear-changelog") {
    const all = await ctx.db.query("changelog").collect();
    for (const entry of all) {
      await ctx.db.delete(entry._id);
    }
    return { success: true, deleted: all.length };
  }

  if (args.name === "seed-feature-requests") {
    let created = 0;
    let skipped = 0;
    const now = Date.now();

    for (const entry of SEED_FEATURE_REQUESTS) {
      // Check if a feature request with this exact title already exists
      const existing = await ctx.db.query("featureRequests").collect();
      const match = existing.find(
        (e: { title: string }) => e.title === entry.title
      );

      if (match) {
        skipped++;
        continue;
      }

      await ctx.db.insert("featureRequests", {
        title: entry.title,
        description: entry.description,
        submitterName: "Envpilot Team",
        status: entry.status,
        category: entry.category,
        adminNotes: entry.adminNotes,
        voteCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return {
      success: true,
      total: SEED_FEATURE_REQUESTS.length,
      created,
      skipped,
    };
  }

  if (args.name === "clear-feature-requests") {
    const allRequests = await ctx.db.query("featureRequests").collect();
    const allVotes = await ctx.db.query("featureVotes").collect();

    for (const vote of allVotes) {
      await ctx.db.delete(vote._id);
    }
    for (const req of allRequests) {
      await ctx.db.delete(req._id);
    }

    return {
      success: true,
      deletedRequests: allRequests.length,
      deletedVotes: allVotes.length,
    };
  }

  if (args.name === "seed-payment-products") {
    const tiers = await ctx.db.query("tierDefinitions").collect();
    const existingProducts = await ctx.db.query("paymentProducts").collect();
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const tier of tiers) {
      if (!tier.polarProductId) continue;
      const alreadyExists = existingProducts.some(
        (p) => p.tierName === tier.name && p.provider === "polar"
      );
      if (alreadyExists) {
        skipped++;
        continue;
      }
      await ctx.db.insert("paymentProducts", {
        tierName: tier.name,
        provider: "polar",
        productId: tier.polarProductId,
        isActive: true,
        label: `${tier.displayName} (Polar)`,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { success: true, created, skipped };
  }

  if (args.name === "migrate-unified-roles") {
    const results = {
      orgMembersToOwner: 0,
      orgMembersToProjectManager: 0,
      orgMembersToTeamLead: 0,
      orgMembersToDeveloper: 0,
      orgMembersSkipped: 0,
      invitationsMigrated: 0,
      invitationsSkipped: 0,
      variablePermissionsMigrated: 0,
      variablePermissionsSkipped: 0,
      developerReadGrantsBackfilled: 0,
      developerReadGrantsSkipped: 0,
    };

    const orgMembers = await ctx.db.query("organizationMembers").collect();

    // "team_lead" exists in BOTH the legacy and the unified model, so it is
    // ambiguous on its own. An un-migrated org always contains at least one
    // legacy "admin" row (the creator) or "member" row; an org with neither
    // is already on the unified model, so its "team_lead" rows are new-model
    // values and must be left alone. This keeps the migration idempotent.
    const legacyOrgIds = new Set<string>();
    for (const member of orgMembers) {
      if (member.role === "admin" || member.role === "member") {
        legacyOrgIds.add(member.organizationId.toString());
      }
    }

    // a. organizationMembers:
    //    admin → owner; team_lead → project_manager (legacy orgs only);
    //    member → team_lead if they hold a legacy "manager" project role on
    //    a non-deleted project in the same org, else developer.
    for (const member of orgMembers) {
      if (member.role === "admin") {
        await ctx.db.patch(member._id, { role: "owner" });
        results.orgMembersToOwner++;
      } else if (
        member.role === "team_lead" &&
        legacyOrgIds.has(member.organizationId.toString())
      ) {
        await ctx.db.patch(member._id, { role: "project_manager" });
        results.orgMembersToProjectManager++;
      } else if (member.role === "member") {
        let promoted = false;
        const projectMemberships = await ctx.db
          .query("projectMembers")
          .withIndex("by_user", (q) => q.eq("userId", member.userId))
          .collect();
        for (const pm of projectMemberships) {
          if (pm.role !== "manager") continue;
          const project = await ctx.db.get(pm.projectId);
          if (
            project &&
            !project.deletedAt &&
            project.organizationId === member.organizationId
          ) {
            promoted = true;
            break;
          }
        }
        if (promoted) {
          await ctx.db.patch(member._id, { role: "team_lead" });
          results.orgMembersToTeamLead++;
        } else {
          await ctx.db.patch(member._id, { role: "developer" });
          results.orgMembersToDeveloper++;
        }
      } else {
        // Already on a unified-model value
        results.orgMembersSkipped++;
      }
    }

    // b. Pending invitations: admin → owner; team_lead → project_manager
    //    (legacy orgs only, same ambiguity rule as above); member → developer
    const pendingInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const invitation of pendingInvitations) {
      if (invitation.role === "admin") {
        await ctx.db.patch(invitation._id, { role: "owner" });
        results.invitationsMigrated++;
      } else if (
        invitation.role === "team_lead" &&
        legacyOrgIds.has(invitation.organizationId.toString())
      ) {
        await ctx.db.patch(invitation._id, { role: "project_manager" });
        results.invitationsMigrated++;
      } else if (invitation.role === "member") {
        await ctx.db.patch(invitation._id, { role: "developer" });
        results.invitationsMigrated++;
      } else {
        results.invitationsSkipped++;
      }
    }

    // c. variablePermissions: legacy "admin" permission → "write"
    const allVariablePermissions = await ctx.db
      .query("variablePermissions")
      .collect();
    for (const perm of allVariablePermissions) {
      if (perm.permission === "admin") {
        await ctx.db.patch(perm._id, { permission: "write" });
        results.variablePermissionsMigrated++;
      } else {
        results.variablePermissionsSkipped++;
      }
    }

    // d. Backfill developer read grants — flow preservation.
    //    Under the old model a project-level "developer" could read ALL
    //    variables in their assigned projects; the unified model makes
    //    developer access grant-based, so without this pass existing
    //    developers would lose visibility the moment roles migrate. Give
    //    every developer a read grant on every (non-deleted) variable in
    //    their assigned projects. Runs AFTER the role passes so it reads
    //    final roles. Idempotent: skips variables that already have an
    //    active grant for the user.
    //    NOTE: this is the only write-heavy part of the migration
    //    (developers × their variables). Bounded and fine at current scale;
    //    if the dataset ever grows very large, split it into its own
    //    chunked migration to stay under the per-mutation write limit.
    const now = Date.now();
    const migratedMembers = await ctx.db.query("organizationMembers").collect();
    for (const member of migratedMembers) {
      if (normalizeOrgRole(member.role) !== "developer") continue;
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", member.userId))
        .collect();
      for (const pm of assignments) {
        const project = await ctx.db.get(pm.projectId);
        if (
          !project ||
          project.deletedAt ||
          project.organizationId !== member.organizationId
        ) {
          continue;
        }
        const projectVariables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", pm.projectId))
          .collect();
        for (const variable of projectVariables) {
          if (variable.deletedAt) continue;
          const existingGrants = await ctx.db
            .query("variablePermissions")
            .withIndex("by_variable_and_user", (q) =>
              q.eq("variableId", variable._id).eq("userId", member.userId)
            )
            .collect();
          const hasActiveGrant = existingGrants.some(
            (g) => g.isActive && (!g.expiresAt || g.expiresAt > now)
          );
          if (hasActiveGrant) {
            results.developerReadGrantsSkipped++;
            continue;
          }
          await ctx.db.insert("variablePermissions", {
            variableId: variable._id,
            userId: member.userId,
            permission: "read",
            grantedBy: member.userId,
            grantedAt: now,
            isActive: true,
          });
          results.developerReadGrantsBackfilled++;
        }
      }
    }

    return { success: true, ...results };
  }

  // Drains legacy/dead data so the corresponding schema declarations can be
  // dropped in a later PR:
  //   a. `organizations.settings` — the write path (teamLeadsCanCreateProjects)
  //      was removed; the field was never consulted by any auth check. Unset it.
  //   b. `usageCounters` rows — the table is never inserted into anywhere
  //      (consumption tracking was never wired up); defensively delete any rows.
  // Idempotent and bounded: writes are capped per run (org patches limited to
  // BATCH, counters deleted in batches of BATCH). Re-run until both
  // `orgSettingsRemaining` is 0 and `usageCountersMayHaveMore` is false.
  if (args.name === "cleanup-dead-data") {
    const BATCH = 500;

    // a. Unset legacy `settings` on organizations.
    const orgs = await ctx.db.query("organizations").collect();
    let orgSettingsUnset = 0;
    let orgSettingsRemaining = 0;
    for (const org of orgs) {
      if (org.settings === undefined) continue;
      if (orgSettingsUnset >= BATCH) {
        orgSettingsRemaining++;
        continue;
      }
      await ctx.db.patch(org._id, { settings: undefined });
      orgSettingsUnset++;
    }

    // b. Delete dead usageCounters rows (expected to be none).
    const counters = await ctx.db.query("usageCounters").take(BATCH);
    for (const counter of counters) {
      await ctx.db.delete(counter._id);
    }

    return {
      success: true,
      orgSettingsUnset,
      orgSettingsRemaining,
      usageCountersDeleted: counters.length,
      usageCountersMayHaveMore: counters.length === BATCH,
    };
  }

  throw new ConvexError(`Unknown migration: ${args.name}`);
}
