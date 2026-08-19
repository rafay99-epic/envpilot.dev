import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@envpilot/ui"],

  // Baked into the bundle so the footer's copyright year needs no wall-clock
  // read at render time (an unstable value under Cache Components).
  env: {
    NEXT_PUBLIC_BUILD_YEAR: String(new Date().getFullYear()),
  },

  // Every route is prerenderable: content comes off disk behind `use cache`,
  // and the only request-time read (the ?tag filter) already sits inside a
  // Suspense boundary. Partial Prefetching then fetches one reusable shell
  // per route instead of one payload per link — the post list links to
  // /[slug] dozens of times and now costs a single prefetch.
  cacheComponents: true,
  partialPrefetching: true,

  compiler: {
    // Strip stray console.* from production bundles; keep error for
    // diagnosing client-side failures (e.g. mermaid render errors).
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
};

export default nextConfig;
