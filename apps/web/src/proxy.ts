import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// Apply authentication middleware using WorkOS AuthKit
// This handles session management and token refresh automatically
export default authkitMiddleware({
  // Redirect URI for OAuth callback
  redirectUri:
    process.env.WORKOS_REDIRECT_URI || "http://localhost:3000/callback",
  // Paths that require authentication
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/sign-in",
      "/sign-up",
      "/callback",
      "/changelog",
      // /blog and /docs moved to blog.envpilot.dev / docs.envpilot.dev —
      // next.config redirects() 301s them before this middleware runs.
      "/faq",
      "/vs/(.*)",
      "/wishlist",
      "/privacy",
      "/terms",
      "/logo",
      "/support",
      "/contact",
      "/pricing",
      "/sitemap.xml",
      "/robots.txt",
      "/api/health",
      "/api/config",
      // Release-version manifest polled by signed-out clients (CLI, extension,
      // web boot) for update/enforcement checks — must return JSON, never a
      // WorkOS redirect.
      "/api/version",
      // Returns 401 JSON for signed-out users; must not redirect to WorkOS
      // (a cross-origin redirect makes client fetches throw on public pages)
      "/api/auth/me",
      "/api/telemetry-envelope",
      "/api/webhooks/polar",
      // Public REST API v1 (organization/projects/variables/accounts) AND the
      // legacy CI/CD secrets pull all authenticate with a Bearer API key, not
      // a browser session — a WorkOS redirect here would hand a machine
      // client an HTML sign-in page instead of JSON. The wildcard covers
      // every current and future /api/v1/* route (secrets, organization,
      // projects, projects/[slug], projects/[slug]/variables,
      // projects/[slug]/accounts) so new endpoints never need a proxy change.
      "/api/v1/(.*)",
      // Remote MCP server (Streamable HTTP, stateless) — authenticates with
      // the SAME Bearer envpk_ API keys as /api/v1/* via its own withMcpAuth
      // wrapper, never a WorkOS session cookie. No sub-path variants: the
      // route only lives at this exact path (SSE is disabled).
      "/api/mcp",
      // The CLI now calls Convex directly for everything, including secret
      // VALUES (Stage 3): the last /api/cli/* vault routes were deleted, so no
      // CLI path needs an unauthenticated bypass anymore.
      // Extension API endpoints use bearer token auth, not browser session auth
      // (only /api/extension/config survives — variables/requests moved to
      // direct Convex actions in Stage 3).
      "/api/extension/(.*)",
      // Secret sharing public pages (email-verified, no browser session needed)
      "/s/(.*)",
      "/api/shares/shr_(.*)/verify-email",
      "/api/shares/shr_(.*)/verify-otp",
      // Public documentation preview pages. The token IS the credential, so
      // an outside reader has no session and a WorkOS redirect would hand
      // them a sign-in page instead of the document.
      "/d/(.*)",
      // Read + passphrase unlock only. The `dshr_` prefix is load-bearing:
      // creating a link and revoking one are addressed by docId / shareId
      // (Convex ids, which never carry this prefix), so they stay behind the
      // session check where they belong.
      "/api/doc-shares/dshr_(.*)",
    ],
  },
});

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next (Next.js internals)
     * - static files (favicon, images, etc.)
     * - public marketing pages. These are listed in unauthenticatedPaths
     *   below, which means the middleware boots the WorkOS SDK and attempts
     *   a session-cookie decrypt only to then allow the request. Excluding
     *   them here skips that work entirely, so crawler traffic on the
     *   marketing site costs no compute.
     *
     *   NOT excluded: "/", "/sign-in" and "/sign-up". The two auth pages
     *   call withAuth() server-side to bounce an already-signed-in user to
     *   the dashboard, and "/" is the OAuth landing surface. Every route
     *   excluded above was checked for withAuth and has none.
     */
    "/((?!_next|changelog|faq|vs/|wishlist|privacy|terms|logo|support|contact|pricing|sitemap\\.xml|robots\\.txt|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
