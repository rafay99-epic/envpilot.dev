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
      "/wishlist",
      "/privacy",
      "/terms",
      "/support",
      "/contact",
      "/api/health",
      "/api/config",
      "/monitoring",
      "/api/webhooks/stripe",
      // CLI API endpoints use bearer token auth, not browser session auth
      "/api/cli/auth",
      "/api/cli/organizations",
      "/api/cli/projects",
      "/api/cli/variables",
      "/api/cli/variables/bulk",
      "/api/cli/tier",
      // Extension API endpoints use bearer token auth, not browser session auth
      "/api/extension/(.*)",
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
