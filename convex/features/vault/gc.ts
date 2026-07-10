import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Vault garbage collection — permanent purge of trashed secrets.
 *
 * Product model: deleting a variable or shared account is a SOFT delete
 * (`deletedAt` set) that opens a 7-day retention/restore window. Once a row's
 * `deletedAt` is older than the window, this GC permanently destroys BOTH the
 * Convex rows (the doc, its version history, and its permission grants) AND the
 * backing WorkOS Vault object(s). Before this existed, nothing ever deleted a
 * Vault object, so "deleted" secrets lived in Vault forever.
 *
 * Ordering of destruction is deliberate and non-negotiable for safety:
 *   1. Gather EVERY Vault ref a doc references (deduplicated).
 *   2. Delete each ref from WorkOS Vault.
 *   3. ONLY once every ref is confirmed gone, hard-delete the Convex rows.
 * A Vault failure for one doc skips ONLY that doc (retried on the next run) and
 * never blocks the others. If WORKOS_API_KEY is unset we abort without deleting
 * anything — we must never orphan a live Vault secret by dropping its DB row.
 */

// Retention/restore window. After this many days a trashed row is purged.
export const PURGE_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// Docs processed per type per run. Small on purpose: each doc triggers one or
// more external Vault DELETE calls, and a full batch reschedules itself.
const PURGE_BATCH_SIZE = 25;

// Runaway guard on the self-rescheduling recursion (each hop is one action).
const MAX_RESCHEDULE_DEPTH = 20;

// ==========================================
// INTERNAL QUERY — list purge-eligible docs
// ==========================================

/**
 * Return the next batch of purge-eligible variables and accounts, each with the
 * DEDUPLICATED set of Vault refs that must be destroyed before its rows.
 *
 * For a variable that set is its own `vaultRef` PLUS every `variableVersions`
 * row's `vaultRef` — legacy version rows share a ref with the variable (and
 * with each other), so the same Vault object must never be DELETEd twice; the
 * set collapses those. For an account it is just its own `vaultRef`.
 *
 * The `deletedAt` range excludes never-deleted rows: `undefined` sorts below
 * all numbers in Convex's index ordering, so we floor with `gt(0)` and ceil
 * with `lt(cutoff)`. `.take()` on the ascending index yields the oldest-deleted
 * (most overdue) rows first.
 */
export const listPurgeEligible = internalQuery({
  args: {},
  returns: v.object({
    variables: v.array(
      v.object({
        id: v.id("environmentVariables"),
        vaultRefs: v.array(v.string()),
      })
    ),
    accounts: v.array(
      v.object({
        id: v.id("projectAccounts"),
        vaultRefs: v.array(v.string()),
      })
    ),
  }),
  handler: async (ctx) => {
    const cutoff = Date.now() - PURGE_RETENTION_DAYS * DAY_MS;

    const variableDocs = await ctx.db
      .query("environmentVariables")
      .withIndex("by_deleted_at", (q) =>
        q.gt("deletedAt", 0).lt("deletedAt", cutoff)
      )
      .take(PURGE_BATCH_SIZE);

    const variables = [];
    for (const variable of variableDocs) {
      const refs = new Set<string>();
      refs.add(variable.vaultRef);

      const versions = await ctx.db
        .query("variableVersions")
        .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
        .collect();
      for (const version of versions) {
        refs.add(version.vaultRef);
      }

      variables.push({ id: variable._id, vaultRefs: [...refs] });
    }

    const accountDocs = await ctx.db
      .query("projectAccounts")
      .withIndex("by_deleted_at", (q) =>
        q.gt("deletedAt", 0).lt("deletedAt", cutoff)
      )
      .take(PURGE_BATCH_SIZE);

    const accounts = accountDocs.map((account) => ({
      id: account._id,
      vaultRefs: [account.vaultRef],
    }));

    return { variables, accounts };
  },
});

// ==========================================
// INTERNAL MUTATIONS — hard-delete rows
// ==========================================

/**
 * Permanently delete a variable's rows AFTER its Vault objects are confirmed
 * gone. Re-checks the retention window defensively: if the row was restored
 * (deletedAt cleared) or is no longer past the cutoff between the snapshot and
 * this call, we skip the DB deletion rather than destroying a live variable.
 */
export const hardDeleteVariable = internalMutation({
  args: { variableId: v.id("environmentVariables") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (!variable) return false;

    const cutoff = Date.now() - PURGE_RETENTION_DAYS * DAY_MS;
    if (variable.deletedAt === undefined || variable.deletedAt >= cutoff) {
      // Restored (or no longer expired) since the purge snapshot — leave it.
      return false;
    }

    const versions = await ctx.db
      .query("variableVersions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .collect();
    for (const version of versions) {
      await ctx.db.delete(version._id);
    }

    const permissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .collect();
    for (const perm of permissions) {
      await ctx.db.delete(perm._id);
    }

    await ctx.db.delete(args.variableId);
    return true;
  },
});

/**
 * Permanently delete an account's rows AFTER its Vault object is confirmed
 * gone. Same defensive retention re-check as hardDeleteVariable.
 */
export const hardDeleteAccount = internalMutation({
  args: { accountId: v.id("projectAccounts") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return false;

    const cutoff = Date.now() - PURGE_RETENTION_DAYS * DAY_MS;
    if (account.deletedAt === undefined || account.deletedAt >= cutoff) {
      return false;
    }

    const permissions = await ctx.db
      .query("accountPermissions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const perm of permissions) {
      await ctx.db.delete(perm._id);
    }

    await ctx.db.delete(args.accountId);
    return true;
  },
});

// ==========================================
// VAULT + OBSERVABILITY HELPERS (action runtime)
// ==========================================

/**
 * Best-effort error report to Sentry's store endpoint. Never throws.
 * Parses the standard DSN shape `https://<key>[:secret]@<host>/<projectId>`.
 */
async function reportToSentry(message: string): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const match = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn);
    if (!match) return;
    const key = match[1].split(":")[0];
    const host = match[2];
    const projectId = match[3];
    await fetch(`https://${host}/api/${projectId}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}`,
      },
      body: JSON.stringify({
        message,
        level: "error",
        tags: { surface: "convex", source: "vault-gc" },
      }),
    });
  } catch {
    // Swallow — observability must never break the purge.
  }
}

/**
 * Delete a single WorkOS Vault object. Returns true when the object is gone
 * (HTTP 2xx) or already gone (404/410 — treat as success so a partially-purged
 * doc can finish on the next run). Any other outcome logs + reports and returns
 * false so the caller skips that doc's DB deletion.
 */
async function deleteVaultObject(
  vaultRef: string,
  apiKey: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.workos.com/vault/v1/kv/${encodeURIComponent(vaultRef)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (res.ok || res.status === 404 || res.status === 410) {
      return true;
    }

    const body = await res.text().catch(() => "");
    console.error("[vaultGc] Vault delete failed", {
      vaultRef,
      status: res.status,
      body,
    });
    await reportToSentry(
      `vault-gc: Vault DELETE ${vaultRef} returned ${res.status} ${body}`
    );
    return false;
  } catch (err) {
    console.error("[vaultGc] Vault delete threw", {
      vaultRef,
      error: String(err),
    });
    await reportToSentry(
      `vault-gc: Vault DELETE ${vaultRef} threw ${String(err)}`
    );
    return false;
  }
}

// ==========================================
// INTERNAL ACTION — purge one batch
// ==========================================

/**
 * Purge one batch of expired trashed variables and accounts. Per-doc: destroy
 * every Vault ref, and only if ALL succeed hard-delete the Convex rows. If a
 * full batch was processed, reschedule immediately (bounded by depth) so a
 * large backlog drains without waiting for the next daily cron.
 */
export const purgeExpiredBatch = internalAction({
  args: { depth: v.optional(v.number()) },
  returns: v.object({
    aborted: v.boolean(),
    purgedVariables: v.number(),
    purgedAccounts: v.number(),
    skipped: v.number(),
    rescheduled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const depth = args.depth ?? 0;

    const apiKey = process.env.WORKOS_API_KEY;
    if (!apiKey) {
      // Never destroy DB rows while the Vault copy survives.
      console.error(
        "[vaultGc] WORKOS_API_KEY is not set in the Convex environment — " +
          "aborting purge. No rows deleted (would orphan live Vault secrets)."
      );
      return {
        aborted: true,
        purgedVariables: 0,
        purgedAccounts: 0,
        skipped: 0,
        rescheduled: false,
      };
    }

    const batch = await ctx.runQuery(internal.vaultGc.listPurgeEligible, {});

    let purgedVariables = 0;
    let purgedAccounts = 0;
    let skipped = 0;

    for (const variable of batch.variables) {
      let allDeleted = true;
      for (const ref of variable.vaultRefs) {
        const ok = await deleteVaultObject(ref, apiKey);
        if (!ok) allDeleted = false;
      }

      if (!allDeleted) {
        // Skip only this doc — its rows stay put and are retried next run.
        skipped++;
        continue;
      }

      const deleted = await ctx.runMutation(
        internal.vaultGc.hardDeleteVariable,
        { variableId: variable.id }
      );
      if (deleted) purgedVariables++;
      else skipped++;
    }

    for (const account of batch.accounts) {
      let allDeleted = true;
      for (const ref of account.vaultRefs) {
        const ok = await deleteVaultObject(ref, apiKey);
        if (!ok) allDeleted = false;
      }

      if (!allDeleted) {
        skipped++;
        continue;
      }

      const deleted = await ctx.runMutation(
        internal.vaultGc.hardDeleteAccount,
        {
          accountId: account.id,
        }
      );
      if (deleted) purgedAccounts++;
      else skipped++;
    }

    // A full batch on either type means more work likely remains.
    const fullBatch =
      batch.variables.length === PURGE_BATCH_SIZE ||
      batch.accounts.length === PURGE_BATCH_SIZE;

    let rescheduled = false;
    if (fullBatch && depth + 1 < MAX_RESCHEDULE_DEPTH) {
      await ctx.scheduler.runAfter(0, internal.vaultGc.purgeExpiredBatch, {
        depth: depth + 1,
      });
      rescheduled = true;
    }

    return {
      aborted: false,
      purgedVariables,
      purgedAccounts,
      skipped,
      rescheduled,
    };
  },
});
