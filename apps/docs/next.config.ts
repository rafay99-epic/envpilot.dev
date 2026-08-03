import type { NextConfig } from "next";

/**
 * Every pre-revamp slug, mapped to the page that now owns its content.
 *
 * These URLs are indexed and linked from the CLI, the extension, blog posts,
 * and the marketing site — they must never 404. Sections are nested now
 * (`/cli/files`), so the flat originals redirect permanently.
 */
const LEGACY_SLUG_REDIRECTS: Record<string, string> = {
  "getting-started": "/start/quickstart",
  architecture: "/start/architecture",
  plans: "/limits/plans",
  "rate-limits": "/limits/rate-limits",
  rbac: "/platform/rbac",
  security: "/platform/security",
  sharing: "/platform/sharing",
  "shared-accounts": "/platform/shared-accounts",
  "variable-lifecycle": "/platform/variables",
  cli: "/cli/overview",
  extension: "/extension/overview",
  "web-dashboard": "/dashboard/overview",
  "github-action": "/action/overview",
  "api-quickstart": "/api/quickstart",
  "api-reference": "/api/overview",
  "api-security": "/api/authentication",
  "mcp-server": "/mcp/overview",
  notifications: "/integrations/notifications",
  "share-environment-variables-securely": "/guides/migrate-from-dotenv",
  "nextjs-environment-variables": "/guides/nextjs",
};

const nextConfig: NextConfig = {
  transpilePackages: ["@envpilot/ui"],
  compiler: {
    // Strip stray console.* from production bundles; keep error for
    // diagnosing client-side failures (e.g. mermaid render errors).
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  async redirects() {
    return Object.entries(LEGACY_SLUG_REDIRECTS).flatMap(
      ([from, destination]) => [
        { source: `/${from}`, destination, permanent: true },
        // The raw-markdown mirror is linked from agent prompts.
        {
          source: `/md/${from}`,
          destination: `/md${destination}`,
          permanent: true,
        },
      ]
    );
  },
};

export default nextConfig;
