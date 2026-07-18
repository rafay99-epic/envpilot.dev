"use node";

import { v, ConvexError } from "convex/values";
import { action } from "../../_generated/server";
import { requireAdminAction } from "./auth";

function getUmamiConfig() {
  const apiKey = process.env.UMAMI_API_KEY;
  const websiteId = process.env.UMAMI_WEBSITE_ID;
  if (!apiKey || !websiteId) {
    // ConvexError so the message survives prod redaction — the client's
    // "not configured" detection depends on reading this text.
    throw new ConvexError(
      "Umami analytics not configured. Set UMAMI_API_KEY and UMAMI_WEBSITE_ID in Convex environment variables."
    );
  }
  return { apiKey, websiteId };
}

async function umamiGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`https://api.umami.is/v1${path}`, {
    headers: { "x-umami-api-key": apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ConvexError(`Umami API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Helper to safely extract a numeric value from Umami stats response.
// The API may return { pageviews: { value: N } } or { pageviews: N }.
function statVal(field: unknown): number {
  if (field === null || field === undefined) return 0;
  if (typeof field === "number") return field;
  if (
    typeof field === "object" &&
    "value" in (field as Record<string, unknown>)
  ) {
    return (field as { value: number }).value ?? 0;
  }
  return 0;
}

// --------------------------------------------------------------------------
// getWebTrafficStats — summary stats + active visitors
// --------------------------------------------------------------------------
export const getWebTrafficStats = action({
  args: {},
  handler: async (ctx) => {
    await requireAdminAction(ctx);
    const { apiKey, websiteId } = getUmamiConfig();

    const now = Date.now();
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const startAt = todayMidnight.getTime();

    const yesterdayStart = startAt - 24 * 60 * 60 * 1000;
    const yesterdayEnd = startAt;

    const [active, todayRaw, yesterdayRaw] = await Promise.all([
      umamiGet(`/websites/${websiteId}/active`, apiKey),
      umamiGet(
        `/websites/${websiteId}/stats?startAt=${startAt}&endAt=${now}`,
        apiKey
      ),
      umamiGet(
        `/websites/${websiteId}/stats?startAt=${yesterdayStart}&endAt=${yesterdayEnd}`,
        apiKey
      ),
    ]);

    // Log the raw response shapes for debugging
    console.log("[Umami] active response:", JSON.stringify(active));
    console.log("[Umami] todayStats response:", JSON.stringify(todayRaw));

    const activeData = active as Record<string, unknown>;
    const today = todayRaw as Record<string, unknown>;
    const yesterday = yesterdayRaw as Record<string, unknown>;

    const pageviews = statVal(today.pageviews);
    const visitors = statVal(today.visitors);
    const visits = statVal(today.visits);
    const bounces = statVal(today.bounces);

    const bounceRate =
      visits > 0 ? Math.round((bounces / visits) * 1000) / 10 : 0;

    const yPageviews = statVal(yesterday.pageviews);
    const yVisitors = statVal(yesterday.visitors);
    const yVisits = statVal(yesterday.visits);
    const yBounces = statVal(yesterday.bounces);
    const yBounceRate =
      yVisits > 0 ? Math.round((yBounces / yVisits) * 1000) / 10 : 0;

    return {
      activeVisitors: typeof activeData.x === "number" ? activeData.x : 0,
      pageviews,
      visitors,
      visits,
      bounceRate,
      yesterday: {
        pageviews: yPageviews,
        visitors: yVisitors,
        bounceRate: yBounceRate,
      },
    };
  },
});

// --------------------------------------------------------------------------
// getWebTrafficPageviews — time-series data for charts
// --------------------------------------------------------------------------
export const getWebTrafficPageviews = action({
  args: {
    range: v.union(v.literal("today"), v.literal("7d"), v.literal("30d")),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);
    const { apiKey, websiteId } = getUmamiConfig();

    const now = Date.now();
    let startAt: number;
    let unit: string;

    if (args.range === "today") {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      startAt = midnight.getTime();
      unit = "hour";
    } else if (args.range === "7d") {
      startAt = now - 7 * 24 * 60 * 60 * 1000;
      unit = "day";
    } else {
      startAt = now - 30 * 24 * 60 * 60 * 1000;
      unit = "day";
    }

    const data = (await umamiGet(
      `/websites/${websiteId}/pageviews?startAt=${startAt}&endAt=${now}&unit=${unit}`,
      apiKey
    )) as {
      pageviews: Array<{ x: string; y: number }>;
      sessions: Array<{ x: string; y: number }>;
    };

    return {
      pageviews: data.pageviews ?? [],
      sessions: data.sessions ?? [],
    };
  },
});

// --------------------------------------------------------------------------
// getShareUrl — returns the Umami public share dashboard URL
// --------------------------------------------------------------------------
export const getShareUrl = action({
  args: {},
  handler: async (ctx) => {
    await requireAdminAction(ctx);
    return process.env.UMAMI_SHARE_URL ?? null;
  },
});
