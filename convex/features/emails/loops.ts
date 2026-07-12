"use node";

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";

const LOOPS_API_BASE = "https://app.loops.so/api/v1";

function getLoopsApiKey(): string | null {
  return process.env.LOOPS_API_KEY ?? null;
}

async function pushContact(
  apiKey: string,
  contact: { email: string; name?: string; userId?: string }
): Promise<{ success: boolean; error?: string }> {
  const firstName = (contact.name ?? "").trim().split(/\s+/)[0] || undefined;
  const nameParts = (contact.name ?? "").trim().split(/\s+/);
  const lastName =
    nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

  const body: Record<string, string | boolean> = {
    email: contact.email,
    subscribed: true,
    source: "app-signup",
  };
  if (firstName) body.firstName = firstName;
  if (lastName) body.lastName = lastName;
  if (contact.userId) body.userId = contact.userId;

  try {
    const res = await fetch(`${LOOPS_API_BASE}/contacts/update`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[LOOPS] HTTP ${res.status}: ${text}`);
      return { success: false, error: `HTTP ${res.status}` };
    }

    console.log("[LOOPS] Synced contact:", contact.email);
    return { success: true };
  } catch (err) {
    console.error(
      "[LOOPS] Exception:",
      err instanceof Error ? err.message : err
    );
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export const syncContactToLoops = internalAction({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = getLoopsApiKey();
    if (!apiKey) {
      console.error("[LOOPS] LOOPS_API_KEY not configured");
      return { success: false, error: "not configured" };
    }

    return pushContact(apiKey, {
      email: args.email,
      name: args.name,
      userId: args.userId,
    });
  },
});

type BackfillResult = { total: number; synced: number; failed: number };

export const backfillContactsToLoops = internalAction({
  args: {},
  handler: async (ctx, _args): Promise<BackfillResult> => {
    const apiKey = getLoopsApiKey();
    if (!apiKey) {
      console.error("[LOOPS] LOOPS_API_KEY not configured");
      return { total: 0, synced: 0, failed: 0 };
    }

    const users = await ctx.runQuery(
      internal.features.users.users.listAllForLoopsBackfill,
      {}
    );

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const result = await pushContact(apiKey, {
        email: user.email,
        name: user.name,
        userId: user.id,
      });

      if (result.success) {
        synced++;
      } else {
        failed++;
      }

      if ((i + 1) % 25 === 0) {
        console.log(
          `[LOOPS] Backfill: ${i + 1}/${users.length} (synced=${synced}, failed=${failed})`
        );
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    console.log(
      `[LOOPS] Backfill complete: ${users.length} total, ${synced} synced, ${failed} failed`
    );

    return { total: users.length, synced, failed };
  },
});
