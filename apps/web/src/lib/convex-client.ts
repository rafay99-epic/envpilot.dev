import { ConvexHttpClient } from "convex/browser";

/**
 * Shared ConvexHttpClient singleton for all server-side Convex calls
 * (API routes, server components, server actions).
 *
 * Previously each of 71+ API routes instantiated its own client at module
 * scope, creating 71 separate HTTP client objects with no connection reuse.
 * This module-level singleton is created once per server instance and shared.
 *
 * NEXT_PUBLIC_CONVEX_URL is inlined at build time by Next.js, so it's
 * guaranteed to be available when this module loads.
 */
export const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
