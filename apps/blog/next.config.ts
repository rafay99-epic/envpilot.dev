import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@envpilot/ui"],

  env: {
    NEXT_PUBLIC_BUILD_YEAR: String(new Date().getFullYear()),
  },

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
