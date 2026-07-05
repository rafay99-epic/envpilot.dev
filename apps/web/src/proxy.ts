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
      "/docs",
      "/docs/(.*)",
      "/faq",
      "/vs/(.*)",
      "/wishlist",
      "/privacy",
      "/terms",
      "/support",
      "/contact",
      "/pricing",
      "/sitemap.xml",
      "/robots.txt",
      "/feed.xml",
      "/llms.txt",
      "/llms-full.txt",
      "/api/health",
      "/api/config",
      "/api/status",
      // Returns 401 JSON for signed-out users; must not redirect to WorkOS
      // (a cross-origin redirect makes client fetches throw on public pages)
      "/api/auth/me",
      "/api/telemetry-envelope",
      "/api/webhooks/polar",
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
     * - API routes that don't need auth (health check)
     */
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
