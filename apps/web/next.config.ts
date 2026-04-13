import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withBotId } from "botid/next/config";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { APP_VERSIONS } from "./src/lib/versions";

// Run `ANALYZE=true bun run build` (or `bun run analyze`) to inspect bundles
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSIONS.web,
  },

  // ── Performance: optimizePackageImports ──────────────────────────────
  // Tree-shakes barrel exports so only used icons/components are bundled.
  // lucide-react alone can drop ~200 KB without this.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "date-fns",
      "recharts",
      "@tanstack/react-query",
      "zod",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "@sentry/nextjs",
    ],

    // ── Client-side router cache ─────────────────────────────────────
    // Keep navigated pages in memory so back/forward is instant.
    // Dynamic pages stay fresh for 30 s; static pages for 5 min.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },

  // ── Image optimization ─────────────────────────────────────────────
  // Allow external avatar/logo domains for next/image
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.workos.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "**.githubusercontent.com" },
      { protocol: "https", hostname: "svgl.app" },
    ],
  },

  // ── Keep heavy server-only packages out of the client bundle ───────
  serverExternalPackages: ["@workos-inc/node"],
};

export default withAnalyzer(
  withBotId(
    withSentryConfig(nextConfig, {
      // For all available options, see:
      // https://www.npmjs.com/package/@sentry/webpack-plugin#options

      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // Only print logs for uploading source maps in CI
      silent: !process.env.CI,

      // For all available options, see:
      // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

      // Upload a larger set of source maps for prettier stack traces (increases build time)
      widenClientFileUpload: true,

      // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      // This can increase your server load as well as your hosting bill.
      // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
      // side errors will fail.
      tunnelRoute: "/monitoring",

      webpack: {
        // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
        // See the following for more information:
        // https://docs.sentry.io/product/crons/
        // https://vercel.com/docs/cron-jobs
        automaticVercelMonitors: true,

        // Tree-shaking options for reducing bundle size
        treeshake: {
          // Automatically tree-shake Sentry logger statements to reduce bundle size
          removeDebugLogging: true,
        },
      },
    })
  )
);
