/**
 * Cache-Control header presets for API routes.
 *
 * Usage: `return NextResponse.json(data, { headers: cacheHeaders.privateShort });`
 *
 * Rule of thumb:
 * - `public`  — safe to cache on shared CDN/proxy (no user-specific data)
 * - `private` — browser-only cache (per-user data)
 * - `no-store` — never cache (auth mutations, sensitive reads)
 *
 * `stale-while-revalidate` lets the browser serve stale content immediately
 * while revalidating in the background, giving instant navigation.
 */
export const cacheHeaders = {
  /**
   * Public, long-lived data (client config, feature flags).
   * CDN + browser cache for 5 minutes, stale-while-revalidate for 1 hour.
   */
  publicLong: {
    "Cache-Control":
      "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
  },

  /**
   * Per-user data that changes infrequently (tier info, org list).
   * Browser caches for 30 seconds, stale-while-revalidate for 2 minutes.
   * Not shared on CDN (private).
   */
  privateMedium: {
    "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
  },

  /**
   * Per-user data called on every page mount (/api/auth/me).
   * Very short cache — just enough to collapse bursts during rapid navigation.
   */
  privateShort: {
    "Cache-Control": "private, max-age=5, stale-while-revalidate=30",
  },

  /**
   * Explicit no-cache for mutations and sensitive reads.
   */
  noStore: {
    "Cache-Control": "no-store, must-revalidate",
  },
} as const;
