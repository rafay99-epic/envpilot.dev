import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";
import { SEED_FEATURES, SEED_ROLES } from "../../lib/seedData";
import {
  hasCapability,
  mergeSystemRoleCapabilities,
} from "../../lib/roleProfiles";
import { getRoleProfile } from "../../lib/authz";
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
        category: "Core",
        priority: 1,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-tier-features",
        description:
          "Seeds default tier-feature overrides for free and pro tiers. Idempotent — skips existing overrides.",
        category: "Core",
        priority: 2,
        destructive: false,
        runOnce: false,
      },
      {
        name: "purge-retired-features",
        description:
          "DELETES registry rows for features whose code no longer exists, plus every tierFeatures override pointing at them. Currently: anomaly_detection and anomaly_detection_limit, removed from the product in July 2026 but still seeded into any deployment that ran seed-feature-registry before then — they render in Tiers & Limits as dials that control nothing. Reads RETIRED_FEATURE_KEYS, so retiring another feature is one array entry. Idempotent: a second run finds nothing and reports zero.",
        category: "Core",
        priority: 2,
        destructive: true,
        runOnce: false,
      },
      {
        name: "seed-tier-definitions",
        description:
          "Seeds or updates default 'free' and 'pro' tier definitions (upsert). Safe to run multiple times — updates existing tiers with latest pricing and display fields.",
        category: "Core",
        priority: 3,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-role-registry",
        description:
          "Seeds the role registry from SEED_ROLES: system-role metadata and levels sync from code; system capability matrices MERGE (new code defaults fill in, admin edits survive) except owner, which stays fully code-synced. Seeded custom roles (editor/viewer) keep their admin-owned METADATA after the first seed, but their capability maps merge the same way system roles do — a newly shipped capability fills in, every explicit admin choice survives. Idempotent.",
        category: "Core",
        priority: 4,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-payment-products",
        description:
          "Seeds payment product mappings from tierDefinitions.polarProductId into the paymentProducts table. Idempotent — skips existing mappings.",
        category: "Core",
        priority: 4,
        destructive: false,
        runOnce: false,
      },

      // ── Content Seeding ──

      // ── Destructive / Reset ──

      // ── One-Time Migrations ──
      {
        name: "enable-role-environment-defaults",
        description:
          "Two steps in one idempotent migration. First it writes an explicit all-environments scope onto every env-scopeable project member that has none (500 members per run, resumes from a stored cursor; re-run until hadMore is false). Only when that scan has finished does it fill the role environment defaults (developer: development, editor: development + staging) onto role rows that have none. Existing members keep exactly the access they had; new assignments get the role default.",
        category: "Migrations",
        priority: 10,
        destructive: false,
        runOnce: false,
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

/**
 * Per-tier feature overrides, read by `seed-tier-features`.
 *
 * That handler INSERTS only — an existing row is never overwritten, so admin
 * edits survive a re-seed. The corollary: changing a value here is a no-op on
 * any deployment already seeded. Shipping a changed default needs a one-off
 * force-setting migration alongside it.
 */
/**
 * Feature keys that no longer have any code behind them.
 *
 * Dropping a key from SEED_FEATURES stops it being re-seeded but does NOT
 * delete the row that is already there — seed-feature-registry upserts, it
 * never prunes. The orphan keeps rendering in the admin Tiers & Limits page
 * as a toggle that gates nothing, which is worse than no toggle at all.
 * `purge-retired-features` deletes these and their tier overrides.
 */
const RETIRED_FEATURE_KEYS = [
  // Behavioral anomaly detection: shipped April 2026, deleted July 2026
  // (commit 8615b7b5). The engine, tables, admin console and crons are all
  // gone; only these registry rows survived the removal.
  "anomaly_detection",
  "anomaly_detection_limit",
];

const TIER_CONFIGS: Record<string, Record<string, string>> = {
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
    jetbrains_access: "true",
    vscode_unsync_customization: "false",
    granular_permissions: "true",
    audit_log_retention_days: "7",
    sso_enabled: "false",
    public_api: "false",
    mcp_server: "false",
    docker_image: "false",
    docker_image_limit: "0",
    github_action_limit: "0",
    team_notifications: "false",
    team_notifications_limit: "0",
    secret_rotation: "false",
    secret_rotation_limit: "7",
    secret_sharing: "false",
    security_hold: "false",
    protected_environments: "false",
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
    project_docs: "true",
    max_docs_per_project: "10",
    max_docs_per_org: "25",
    doc_sharing: "true",
    doc_public_links: "false",
    max_active_doc_links: "0",
    // A taste of workspaces: one workspace, three projects in it, ten shared
    // variables. Enough to solve one real duplication, small enough to convert.
    workspaces: "true",
    max_workspaces: "1",
    max_projects_per_workspace: "3",
    max_workspaces_per_project: "1",
    max_variables_per_workspace: "10",
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
    jetbrains_access: "true",
    vscode_unsync_customization: "true",
    granular_permissions: "true",
    audit_log_retention_days: "365",
    sso_enabled: "false",
    public_api: "true",
    mcp_server: "true",
    docker_image: "true",
    docker_image_limit: "10",
    github_action_limit: "10",
    team_notifications: "true",
    team_notifications_limit: "10",
    secret_rotation: "true",
    secret_rotation_limit: "null",
    secret_sharing: "true",
    security_hold: "true",
    protected_environments: "true",
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
    max_docs_per_project: "null",
    max_docs_per_org: "null",
    doc_sharing: "true",
    doc_public_links: "true",
    max_active_doc_links: "null",
    workspaces: "true",
    max_workspaces: "null",
    // These two are NOT paywalls. 50 member projects bounds the conflict
    // lookups one variable write performs inside a mutation; 5 workspaces
    // bounds the indexed reads one pull performs. Raise them in tier config
    // when someone actually reaches them.
    max_projects_per_workspace: "50",
    max_workspaces_per_project: "5",
    max_variables_per_workspace: "null",
  },
};

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
        ...(role.environments ? { environments: role.environments } : {}),
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    // Role environment defaults are NOT filled onto existing rows here. A
    // deploy runs this seed automatically, and narrowing developer rows
    // before their member assignments carry an explicit scope would hide
    // staging and production from every existing developer. Fresh rows get
    // the default on insert above; existing deployments enable it once via
    // enable-role-environment-defaults, which backfills members first.

    return {
      success: true,
      drift,
      created,
      updated,
      skipped,
      total: SEED_ROLES.length,
    };
  }

  if (args.name === "purge-retired-features") {
    let registryDeleted = 0;
    let overridesDeleted = 0;
    const purged: string[] = [];

    for (const key of RETIRED_FEATURE_KEYS) {
      // Tier overrides first: deleting the registry row while its overrides
      // survive would leave rows that no UI lists and no resolver reads.
      const overrides = await ctx.db
        .query("tierFeatures")
        .withIndex("by_feature", (q: any) => q.eq("featureKey", key))
        .collect();
      for (const override of overrides) {
        await ctx.db.delete(override._id);
        overridesDeleted++;
      }

      const registryRow = await ctx.db
        .query("featureRegistry")
        .withIndex("by_key", (q: any) => q.eq("key", key))
        .first();
      if (registryRow) {
        await ctx.db.delete(registryRow._id);
        registryDeleted++;
        purged.push(key);
      }
    }

    return {
      success: true,
      total: RETIRED_FEATURE_KEYS.length,
      migrated: registryDeleted,
      updated: overridesDeleted,
      skipped: RETIRED_FEATURE_KEYS.length - registryDeleted,
      details: purged.length
        ? `Purged ${purged.join(", ")} and ${overridesDeleted} tier override(s).`
        : "Nothing to purge — no retired feature rows present.",
    };
  }

  if (args.name === "seed-tier-features") {
    const tierConfigs = TIER_CONFIGS;

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

  /**
   * Backfill `docContent.status` from the parent `docs` row.
   *
   * The body search index filters on `docContent.status`, so any row written
   * before that field existed carries `undefined` and can never match a
   * published-only search — the page would be silently unfindable by its own
   * text, with no error anywhere.
   *
   * Batch sized against the read limit, not convenience: a body row holds up
   * to 256KB, so 20 rows plus their parents is ~5MB — 200 would be ~51MB and
   * roll back forever. Only rows still missing the field are read, and
   * orphans are deleted rather than skipped, so every run makes progress:
   * re-run until `hadMore` is false.
   */
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

  if (args.name === "enable-role-environment-defaults") {
    const PAGE = 500;
    const CURSOR_KEY = "roleEnvironmentDefaultsCursor";
    const ALL_ENVIRONMENTS = ["development", "staging", "production"];
    const now = Date.now();

    // Resumable scan: the cursor lives in adminSettings so each run reads one
    // bounded page instead of the whole table.
    const cursorRow = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", CURSOR_KEY))
      .first();
    const page = await ctx.db
      .query("projectMembers")
      .paginate({ numItems: PAGE, cursor: cursorRow?.value ?? null });

    const profileCache = new Map<string, boolean>();
    let patched = 0;
    for (const member of page.page) {
      if (member.environments !== undefined) continue;
      const project = await ctx.db.get(member.projectId);
      if (!project) continue;
      const orgMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q
            .eq("organizationId", project.organizationId)
            .eq("userId", member.userId)
        )
        .first();
      if (!orgMembership) continue;
      let scoped = profileCache.get(orgMembership.role);
      if (scoped === undefined) {
        const profile = await getRoleProfile(ctx, orgMembership.role);
        scoped = hasCapability(profile, "access.env_scoped");
        profileCache.set(orgMembership.role, scoped);
      }
      if (!scoped) continue;
      await ctx.db.patch(member._id, { environments: ALL_ENVIRONMENTS });
      patched++;
    }

    if (!page.isDone) {
      if (cursorRow) {
        await ctx.db.patch(cursorRow._id, {
          value: page.continueCursor,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("adminSettings", {
          key: CURSOR_KEY,
          value: page.continueCursor,
          updatedAt: now,
        });
      }
      return { success: true, patched, rolesFilled: 0, hadMore: true };
    }

    // Members are all explicit now: the role defaults can take effect.
    if (cursorRow) await ctx.db.delete(cursorRow._id);
    let rolesFilled = 0;
    for (const role of SEED_ROLES) {
      if (!role.environments) continue;
      const row = await ctx.db
        .query("roleRegistry")
        .withIndex("by_slug", (q) => q.eq("slug", role.slug))
        .first();
      if (row && row.environments === undefined) {
        await ctx.db.patch(row._id, {
          environments: role.environments,
          updatedAt: now,
        });
        rolesFilled++;
      }
    }

    return { success: true, patched, rolesFilled, hadMore: false };
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
  throw new ConvexError(`Unknown migration: ${args.name}`);
}
