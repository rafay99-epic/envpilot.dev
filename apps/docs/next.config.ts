import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@envpilot/ui"],
  compiler: {
    // Strip stray console.* from production bundles; keep error for
    // diagnosing client-side failures (e.g. mermaid render errors).
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
};

export default nextConfig;
