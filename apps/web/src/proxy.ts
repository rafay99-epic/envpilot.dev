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
      "/api/health",
      "/api/config",
      "/api/status",
      "/api/version",
      "/api/auth/me",
      "/api/telemetry-envelope",
      "/api/webhooks/polar",
      "/api/v1/(.*)",
      "/api/mcp",
      "/api/extension/(.*)",
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
