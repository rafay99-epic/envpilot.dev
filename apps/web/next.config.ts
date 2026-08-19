import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { APP_VERSIONS } from "./src/lib/versions";
import { remoteImagePatterns } from "./src/lib/image-hosts";

const sentryTunnelRoute = "/api/telemetry-envelope";

// Run `ANALYZE=true bun run build` (or `bun run analyze`) to inspect bundles
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const blogUrl = process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.envpilot.dev";
const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.envpilot.dev";

const nextConfig: NextConfig = {
  // `next build` and `next dev` share this directory, including its
  // `node_modules` symlink farm. A build run while the dev server is up
  // rewrites that farm underneath it, and the dev server then fails to
  // resolve packages from the wrong base directory ("resolve 'tailwindcss'
  // in .../apps"). Set NEXT_DIST_DIR to verify a build without touching a
  // running dev server. Unset everywhere else, so CI and Vercel are
  // unaffected.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactCompiler: true,

  // ── Cache Components + Partial Prefetching ─────────────────────────
  // Dynamic by default with explicit `use cache` boundaries. Every route
  // prerenders a static shell and streams the rest, so a link click paints
  // immediately instead of waiting on the server. Partial Prefetching then
  // fetches ONE reusable shell per route rather than one payload per link —
  // the projects grid and the sidebar both link at /dashboard/projects/[slug]
  // many times over and now cost a single prefetch between them.
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@envpilot/ui"],
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSIONS.web,
    // Baked in so the footer's copyright year needs no wall-clock read at
    // render time (an unstable value under Cache Components).
    NEXT_PUBLIC_BUILD_YEAR: String(new Date().getFullYear()),
  },

  // ── Blog + docs moved to their own apps/subdomains ─────────────────
  // Permanent redirects preserve inbound links and SEO equity. These run
  // BEFORE middleware, so proxy.ts never sees these paths.
  async redirects() {
    return [
      { source: "/blog", destination: blogUrl, permanent: true },
      {
        source: "/blog/:path*",
        destination: `${blogUrl}/:path*`,
        permanent: true,
      },
      { source: "/docs", destination: docsUrl, permanent: true },
      {
        source: "/docs/:path*",
        destination: `${docsUrl}/:path*`,
        permanent: true,
      },
      // Docs-content meta routes that used to be served from this app
      {
        source: "/feed.xml",
        destination: `${docsUrl}/feed.xml`,
        permanent: true,
      },
      {
        source: "/llms.txt",
        destination: `${docsUrl}/llms.txt`,
        permanent: true,
      },
      {
        source: "/llms-full.txt",
        destination: `${docsUrl}/llms-full.txt`,
        permanent: true,
      },
    ];
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
    // Keep navigated pages in memory so back/forward is instant. The
    // dashboard shell is now prerendered rather than re-run per navigation,
    // so this no longer has to paper over the layout's auth round trips —
    // it just keeps already-fetched RSC payloads around.
    staleTimes: {
      dynamic: 180,
      static: 300,
    },

    // Runs the React Compiler natively inside Turbopack instead of shelling
    // out to Babel. Same output, no JS round trip per module.
    turbopackRustReactCompiler: true,
  },

  // ── Image optimization ─────────────────────────────────────────────
  // Derived from OPTIMIZED_IMAGE_HOSTS so the runtime host check in
  // isOptimizableImageHost cannot disagree with what the optimizer accepts.
  images: {
    remotePatterns: remoteImagePatterns,
  },

  // ── Keep heavy server-only packages out of the client bundle ───────
  serverExternalPackages: ["@workos-inc/node"],
};

export default withAnalyzer(
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
    tunnelRoute: sentryTunnelRoute,

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
);
