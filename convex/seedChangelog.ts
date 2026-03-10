import { mutation } from "./_generated/server";

/**
 * Production seed: populate changelog from actual merged PRs.
 * Run once via Convex dashboard: api.seedChangelog.seedChangelog
 *
 * Based on 14 merged pull requests (#1, #2, #5–#16).
 */
export const seedChangelog = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if changelog already has entries
    const existingEntries = await ctx.db.query("changelog").take(1);
    if (existingEntries.length > 0) {
      return { message: "Changelog already has entries, skipping seed" };
    }

    // Actual PR merge timestamps (UTC)
    const entries = [
      // PR #1 — 2026-03-09 09:00 UTC
      {
        title: "Org-scoped ENV workflow hardening",
        content: `Hardened organization-scoped role and routing for the dashboard, API, CLI, and VS Code extension.

## Key Changes

- **Member variable request workflow** — members can submit variable requests (pending → approve/reject/cancel) with full audit trail
- **Read-only enforcement** — members get read-only access to variables while still being able to request writes
- **Token revocation** — CLI and extension tokens are automatically revoked when a member is removed from an organization
- **Billing bypass** — pre-alpha flow testing no longer blocked by billing gates
- **Cookie handling** — aligned project/org active-context cookies across the app and invitation acceptance flow`,
        version: "v0.1.0",
        type: "feature" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-09T09:00:01Z").getTime(),
        createdAt: new Date("2026-03-09T09:00:01Z").getTime(),
        updatedAt: new Date("2026-03-09T09:00:01Z").getTime(),
      },

      // PR #2 — 2026-03-09 08:56 UTC
      {
        title: "Extension read-only enforcement & variable requests",
        content: `VS Code extension now enforces role-based permissions and lets members submit variable requests directly from the editor.

## What's New

- **Read-only for members** — after syncing \`.env.local\`, member files are set to \`chmod 444\` with file watchers that detect and revert edits
- **Variable request dialog** — members can submit variable requests through a multi-step UI directly in VS Code
- **Role-aware endpoints** — \`/api/extension/organizations\` and \`/api/extension/variables\` now return the user's membership role
- **Pending requests in tree view** — members see a "Pending Requests" section in the Variables panel`,
        version: "v0.1.1",
        type: "feature" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-09T08:56:35Z").getTime(),
        createdAt: new Date("2026-03-09T08:56:35Z").getTime(),
        updatedAt: new Date("2026-03-09T08:56:35Z").getTime(),
      },

      // PR #5 — 2026-03-09 11:04 UTC
      {
        title: "Monorepo migration with bun workspaces & Turborepo",
        content: `Converted the three independent packages into a unified monorepo for better developer experience and build performance.

## Changes

- **Bun workspaces** — single lock file, faster installs
- **Turborepo** — parallel builds with task caching across all apps
- **Shared configs** — ESLint v9 flat config, TypeScript base configs, and Prettier shared across all packages
- **Path aliases** — all 111 relative convex imports replaced with \`@convex/*\`
- **Single env file** — \`.env.local\` at root with symlink to \`apps/web/\`
- **Zod v4** — CLI upgraded from Zod v3 to v4`,
        version: "v0.2.0",
        type: "improvement" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-09T11:04:01Z").getTime(),
        createdAt: new Date("2026-03-09T11:04:01Z").getTime(),
        updatedAt: new Date("2026-03-09T11:04:01Z").getTime(),
      },

      // PR #6 — 2026-03-09 12:33 UTC
      {
        title: "Rebrand: ENV Connect → Envpilot",
        content: `Complete rebrand across the entire monorepo — 60+ files updated.

## Scope

- **Package names**: \`@env-connect/*\` → \`@envpilot/*\`
- **CLI binary**: \`env-connect\` → \`envpilot\`
- **Config files**: \`.envconnect\` → \`.envpilot\`
- **Domain**: \`envconnect.app\` → \`envpilot.dev\`
- **VS Code extension**: ~80 command ID and configuration section updates
- **Web app**: page titles, metadata, domain references, cookie names, email templates`,
        version: "v0.3.0",
        type: "breaking" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-09T12:33:59Z").getTime(),
        createdAt: new Date("2026-03-09T12:33:59Z").getTime(),
        updatedAt: new Date("2026-03-09T12:33:59Z").getTime(),
      },

      // PR #7 — 2026-03-09 14:54 UTC
      {
        title: "WebSocket-based extension & backend security audit",
        content: `Replaced HTTP polling with persistent Convex WebSocket subscriptions and hardened the backend with security fixes.

## Cost Optimization

- Migrated from 5-second HTTP polling (~744 calls/hour/user) to reactive WebSocket subscriptions — **near-zero API cost**
- Deleted the polling endpoint entirely

## Security

- Scoped user search to organization level to prevent cross-org data enumeration
- Strengthened CLI session codes (12 chars, 5-minute expiry)
- Added rate limiting with token bucket and fixed window strategies

## Performance

- Fixed N+1 queries in auditLogs, permissions, projectAccess, and invitations
- Added database indexes for audit log filtering
- Scheduled cron jobs for automatic cleanup of expired records`,
        version: "v0.4.0",
        type: "security" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-09T14:54:56Z").getTime(),
        createdAt: new Date("2026-03-09T14:54:56Z").getTime(),
        updatedAt: new Date("2026-03-09T14:54:56Z").getTime(),
      },

      // PR #8 — 2026-03-09 19:04 UTC
      {
        title: "Landing page redesign with 10 UI variants",
        content: `Created 10 completely different landing page designs and a comprehensive documentation page.

## Highlights

- **10 unique landing page variants** — each with distinct visual theme, custom animations, and component architecture
- **Real CLI commands** — integrated actual CLI commands (login, init, pull, push, list, switch, logout) with accurate flags
- **Documentation page** — covers CLI, VS Code extension, web dashboard, security, and RBAC
- **Pricing sections** — free alpha tier and upcoming pro plan
- **Feature flags** — variant visibility controlled by flags; Terminal variant selected as the production design
- **Lucide icons** — replaced all inline SVGs and emojis with professional lucide-react icons`,
        version: "v0.5.0",
        type: "feature" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-09T19:04:25Z").getTime(),
        createdAt: new Date("2026-03-09T19:04:25Z").getTime(),
        updatedAt: new Date("2026-03-09T19:04:25Z").getTime(),
      },

      // PR #9 — 2026-03-09 20:00 UTC
      {
        title:
          "VS Code extension: webview dashboard, commit guard & enhanced UI",
        content: `Major extension update with a terminal-themed dashboard, dual-layer .env commit protection, and CodeLens annotations.

## New Features

- **Webview Dashboard** — terminal-inspired dark UI showing project stats, active project terminal window, directory cards with sync status, and quick actions
- **Dual-Layer Commit Guard** — Layer 1 auto-unstages .env files via Git Extension API; Layer 2 installs a pre-commit hook to catch commits outside VS Code
- **CodeLens Annotations** — sync status and variable counts above .env files; contextual guidance for managed, unmanaged, and unlinked directories
- **Enhanced Tree View** — directory icons color-coded by sync staleness (green <1hr, amber >1hr, gray never), variable version badges, sensitive value char counts
- **Structured Logging** — shared singleton output channel with timestamps`,
        version: "v0.6.0",
        type: "feature" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-09T20:00:57Z").getTime(),
        createdAt: new Date("2026-03-09T20:00:57Z").getTime(),
        updatedAt: new Date("2026-03-09T20:00:57Z").getTime(),
      },

      // PR #10 — 2026-03-09 20:46 UTC
      {
        title: "Vercel Web Analytics integration",
        content: `Added Vercel Web Analytics to the Next.js app for production traffic insights.

## Changes

- Installed \`@vercel/analytics\` and added the \`<Analytics />\` component to the root layout
- Zero-config — analytics are automatically collected once deployed to Vercel
- No impact on bundle size or client performance`,
        version: "v0.6.1",
        type: "improvement" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-09T20:46:13Z").getTime(),
        createdAt: new Date("2026-03-09T20:46:13Z").getTime(),
        updatedAt: new Date("2026-03-09T20:46:13Z").getTime(),
      },

      // PR #11 — 2026-03-10 08:28 UTC
      {
        title: "CLI: RBAC role awareness & git safety checks",
        content: `The CLI now understands your team role and blocks dangerous .env operations.

## Role Awareness

- CLI caches and displays your role per organization
- Pre-push warnings for members with confirmation prompt
- Enhanced feedback for pending requests (HTTP 202)
- Member-specific notices on pull/list operations

## Git Safety

- Blocks \`push\`/\`pull\` if \`.env\` files are tracked by git
- Auto-suggests \`git rm --cached\` commands to untrack
- Warning on \`init\` if \`.env\` files are already tracked

## Release Infrastructure

- Standalone binary builds for 5 platforms (macOS arm64/x64, Linux x64/arm64, Windows x64)
- Curl install script with auto platform detection
- GitHub Actions workflow for npm publishing + GitHub releases`,
        version: "v0.7.0",
        type: "feature" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-10T08:28:32Z").getTime(),
        createdAt: new Date("2026-03-10T08:28:32Z").getTime(),
        updatedAt: new Date("2026-03-10T08:28:32Z").getTime(),
      },

      // PR #12 — 2026-03-10 07:53 UTC
      {
        title: "WorkOS auth & Convex production deployment",
        content: `Set up production infrastructure for authentication and automated backend deployments.

## Changes

- **turbo.json** — declared 15 environment variables to fix Vercel build warnings
- **GitHub Actions** — new \`deploy-convex.yml\` workflow automatically deploys Convex functions when they change on main
- **Deployment key** — uses \`CONVEX_DEPLOY_KEY\` secret for secure automated deploys`,
        version: "v0.7.1",
        type: "improvement" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-10T07:53:00Z").getTime(),
        createdAt: new Date("2026-03-10T07:53:00Z").getTime(),
        updatedAt: new Date("2026-03-10T07:53:00Z").getTime(),
      },

      // PR #13 — 2026-03-10 08:27 UTC
      {
        title: "Extension: build-time server URL injection",
        content: `Removed hardcoded localhost from the VS Code extension, enabling Marketplace publishing.

## Changes

- Replaced \`http://localhost:3000\` with \`ENVPILOT_SERVER_URL\` injected at build time via esbuild \`--define\`
- Added \`scripts/build.mjs\` for esbuild configuration
- Falls back to localhost for local development when env var is not set
- Users can still override via \`envpilot.serverUrl\` VS Code setting
- New GitHub Actions workflow builds, packages, and stores VSIX artifacts`,
        version: "v0.7.2",
        type: "improvement" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-10T08:27:15Z").getTime(),
        createdAt: new Date("2026-03-10T08:27:15Z").getTime(),
        updatedAt: new Date("2026-03-10T08:27:15Z").getTime(),
      },

      // PR #14 — 2026-03-10 08:26 UTC
      {
        title: "Public pages redesign with terminal-dark theme",
        content: `Redesigned all public pages to match the landing page's terminal-dark aesthetic.

## Pages Updated

- **Changelog** — terminal-style filter buttons and timeline layout
- **Wishlist** — Kanban roadmap view with status columns
- **Privacy Policy** — sticky sidebar TOC with active section tracking, comprehensive GDPR/CCPA/APAC coverage
- **Terms of Service** — sidebar navigation matching privacy page style

All pages now use consistent green accents, monospace fonts, and command-style labels.`,
        version: "v0.8.0",
        type: "improvement" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-10T08:26:21Z").getTime(),
        createdAt: new Date("2026-03-10T08:26:21Z").getTime(),
        updatedAt: new Date("2026-03-10T08:26:21Z").getTime(),
      },

      // PR #15 — 2026-03-10 10:19 UTC
      {
        title: "Project-level RBAC & invitation email fixes",
        content: `Admins can now restrict team members to specific projects, and invitation emails are working reliably.

## Key Changes

- **Project-level RBAC** — three-tier project roles (viewer / developer / manager) with access control based on project membership
- **Org-level settings** — toggle to control whether team leads can create projects
- **Invite improvements** — assign projects and roles during team member invitation; visible feedback when emails fail
- **Email fixes** — hardcoded FROM display name, proper error handling instead of silent failures
- **Project member management** — full CRUD API for managing project-specific team access`,
        version: "v0.9.0",
        type: "feature" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-10T10:19:55Z").getTime(),
        createdAt: new Date("2026-03-10T10:19:55Z").getTime(),
        updatedAt: new Date("2026-03-10T10:19:55Z").getTime(),
      },

      // PR #16 — 2026-03-10 13:27 UTC
      {
        title: "Project-level RBAC across CLI, extension & dashboard",
        content: `Propagated project-level permissions to all client surfaces, completing the RBAC system end-to-end.

## Server-side Security

- All variable write endpoints (CLI bulk/single push, extension requests) enforce project-level roles
- Hard blocks for viewers; request workflows for developers
- Project managers can approve variable requests for their projects

## Client Improvements

- **CLI** — \`init\`, \`list\`, \`push\`, \`pull\`, \`switch\` commands display project roles
- **Extension** — roles shown in tree view and headers
- **Dashboard sidebar** — pending requests badge (amber count) for admins and team leads

## CI/CD

- GitHub Actions workflow to build CLI binaries for all platforms (darwin-arm64/x64, linux-x64/arm64, windows-x64) on every PR and main push
- Updated CLI default API URL to production`,
        version: "v1.0.0",
        type: "feature" as const,
        isPublished: true,
        publishedAt: new Date("2026-03-10T13:27:37Z").getTime(),
        createdAt: new Date("2026-03-10T13:27:37Z").getTime(),
        updatedAt: new Date("2026-03-10T13:27:37Z").getTime(),
      },
    ];

    // Insert all entries
    const insertedIds = [];
    for (const entry of entries) {
      const id = await ctx.db.insert("changelog", entry);
      insertedIds.push(id);
    }

    return {
      message: `Successfully seeded ${insertedIds.length} changelog entries from merged PRs`,
      ids: insertedIds,
    };
  },
});
