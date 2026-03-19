import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Changelog Queries and Mutations
 * Public queries for viewing changelog entries
 */

// ==========================================
// QUERIES
// ==========================================

/**
 * List all published changelog entries (public)
 * Sorted by publishedAt in descending order (newest first)
 */
export const listPublished = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_published", (q) => q.eq("isPublished", true))
      .order("desc")
      .take(limit);

    // Sort by publishedAt descending
    return entries.sort((a, b) => {
      const aTime = a.publishedAt ?? a.createdAt;
      const bTime = b.publishedAt ?? b.createdAt;
      return bTime - aTime;
    });
  },
});

/**
 * Get a single changelog entry by ID (public if published)
 */
export const getById = query({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);

    // Only return if published
    if (!entry || !entry.isPublished) {
      return null;
    }

    return entry;
  },
});

/**
 * Get a changelog entry by version (public if published)
 */
export const getByVersion = query({
  args: { version: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("changelog")
      .withIndex("by_version", (q) => q.eq("version", args.version))
      .first();

    // Only return if published
    if (!entry || !entry.isPublished) {
      return null;
    }

    return entry;
  },
});

/**
 * List changelog entries filtered by type (public)
 */
export const listByType = query({
  args: {
    type: v.union(
      v.literal("feature"),
      v.literal("fix"),
      v.literal("improvement"),
      v.literal("security"),
      v.literal("breaking")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .order("desc")
      .take(limit * 2); // Fetch more to filter

    // Filter to only published entries
    const published = entries.filter((e) => e.isPublished);

    // Sort by publishedAt descending and limit
    return published
      .sort((a, b) => {
        const aTime = a.publishedAt ?? a.createdAt;
        const bTime = b.publishedAt ?? b.createdAt;
        return bTime - aTime;
      })
      .slice(0, limit);
  },
});

/**
 * Get all unique versions (public)
 */
export const listVersions = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_published", (q) => q.eq("isPublished", true))
      .collect();

    // Extract unique versions sorted by publishedAt
    const versionMap = new Map<string, number>();
    for (const entry of entries) {
      const time = entry.publishedAt ?? entry.createdAt;
      const existing = versionMap.get(entry.version);
      if (!existing || time > existing) {
        versionMap.set(entry.version, time);
      }
    }

    // Sort versions by their most recent publishedAt
    return Array.from(versionMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([version]) => version);
  },
});

// ==========================================
// ADMIN MUTATIONS (for future admin panel)
// ==========================================

/**
 * Create a new changelog entry
 */
export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    version: v.string(),
    type: v.union(
      v.literal("feature"),
      v.literal("fix"),
      v.literal("improvement"),
      v.literal("security"),
      v.literal("breaking")
    ),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const isPublished = args.isPublished ?? false;

    const entryId = await ctx.db.insert("changelog", {
      title: args.title,
      content: args.content,
      version: args.version,
      type: args.type,
      isPublished,
      publishedAt: isPublished ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return entryId;
  },
});

/**
 * Update a changelog entry
 */
export const update = mutation({
  args: {
    id: v.id("changelog"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    version: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("feature"),
        v.literal("fix"),
        v.literal("improvement"),
        v.literal("security"),
        v.literal("breaking")
      )
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Changelog entry not found");
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.version !== undefined) updateData.version = updates.version;
    if (updates.type !== undefined) updateData.type = updates.type;

    await ctx.db.patch(id, updateData);

    return id;
  },
});

/**
 * Publish a changelog entry
 */
export const publish = mutation({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Changelog entry not found");
    }

    await ctx.db.patch(args.id, {
      isPublished: true,
      publishedAt: now,
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Unpublish a changelog entry
 */
export const unpublish = mutation({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Changelog entry not found");
    }

    await ctx.db.patch(args.id, {
      isPublished: false,
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Delete a changelog entry
 */
export const remove = mutation({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Changelog entry not found");
    }

    await ctx.db.delete(args.id);
  },
});

// ==========================================
// SEED DATA
// ==========================================

type ChangelogType =
  | "feature"
  | "fix"
  | "improvement"
  | "security"
  | "breaking";

interface SeedEntry {
  title: string;
  content: string;
  version: string;
  type: ChangelogType;
  publishedAt: number;
}

/**
 * Helper to create a timestamp from a date string (UTC).
 * Format: "YYYY-MM-DD HH:MM" or "YYYY-MM-DD"
 */
function ts(dateStr: string): number {
  return new Date(
    dateStr + (dateStr.includes("T") ? "" : "T12:00:00Z")
  ).getTime();
}

export const SEED_CHANGELOG: SeedEntry[] = [
  // ============================================================
  // v0.1.0 — Foundation & Initial Platform (2026-03-07 – 2026-03-09)
  // ============================================================
  {
    title: "Initial Platform Launch",
    version: "v0.1.0",
    type: "feature",
    publishedAt: ts("2026-03-07"),
    content: `Envpilot is live with its foundational architecture — a secure environment variable management platform with three client surfaces.

### Web Dashboard
- Organization and project management with full CRUD operations
- Environment variable management with development, staging, and production scoping
- Team member invitation and management system
- Real-time data via Convex database with reactive queries

### CLI Tool
- \`envpilot login\` — authenticate via browser-based OAuth
- \`envpilot init\` — initialize and link a project directory
- \`envpilot pull\` — download environment variables to \`.env\` file
- \`envpilot push\` — upload local environment variables to the platform
- \`envpilot list\` — view all variables for the current project
- \`envpilot switch\` — switch between environments (dev/staging/prod)
- \`envpilot logout\` — end the current session

### VS Code Extension
- Authenticate directly from the editor
- Link projects and sync \`.env\` files
- View variables in the sidebar tree view

### Security
- All secrets encrypted via WorkOS Vault (AES-256) — Convex only stores vault reference IDs, never plaintext
- Authentication via WorkOS AuthKit (email + Google OAuth)
- Three-tier RBAC: Admin, Team Lead, Member`,
  },
  {
    title: "Org-Scoped Workflow Hardening",
    version: "v0.1.0",
    type: "security",
    publishedAt: ts("2026-03-09T09:00:00Z"),
    content: `Comprehensive hardening pass across the entire platform for organization-scoped security.

### Member Variable Request Workflow
- Members can no longer directly modify variables — they submit requests instead
- Full request lifecycle: pending → approved / rejected / cancelled
- Complete audit trail for every request state change

### Access Control
- Enforced member read-only behavior with request-based write access
- CLI and extension tokens are now automatically revoked when a membership is removed
- Org-scoped routing hardened across all dashboard and API flows

### VS Code Extension — Read-Only Enforcement
- After syncing \`.env.local\`, member files are set to read-only (\`chmod 444\`)
- File watchers detect edits, show a warning notification, and automatically revert changes
- New "Request Variable" command lets members submit access requests from the editor
- Pending requests visible in the Variables tree view`,
  },

  // ============================================================
  // v1.0.0 — Monorepo Migration & Rebrand (2026-03-09)
  // ============================================================
  {
    title: "Monorepo Migration with Bun & Turborepo",
    version: "v1.0.0",
    type: "breaking",
    publishedAt: ts("2026-03-09T11:04:00Z"),
    content: `Restructured the entire codebase from a flat directory layout into a unified monorepo.

### Architecture
- Web app, CLI, and VS Code extension moved into \`apps/\`
- Shared configuration packages (TypeScript, ESLint, Prettier) in \`packages/\`
- Convex backend remains at root (required by Convex CLI)

### Tooling Changes
- **Package manager**: npm → Bun (faster installs, native workspace support)
- **Build orchestration**: Turborepo with task pipelines for build, dev, lint, typecheck
- **ESLint**: Migrated to ESLint v9 flat config with shared presets
- **CLI**: Upgraded from Zod v3 to Zod v4

### Import System
- All 111 relative Convex imports replaced with \`@convex/*\` path alias
- Single \`.env.local\` at monorepo root with symlink to \`apps/web/\``,
  },
  {
    title: "Rebrand: ENV Connect → Envpilot",
    version: "v1.0.0",
    type: "breaking",
    publishedAt: ts("2026-03-09T12:34:00Z"),
    content: `Complete rebrand across the entire platform — 60+ files updated.

### What Changed
- Package names: \`@env-connect/*\` → \`@envpilot/*\`
- CLI binary: \`env-connect\` → \`envpilot\`
- Config directory: \`.envconnect\` → \`.envpilot\`
- Domain: \`envconnect.app\` → \`envpilot.dev\`
- All user-facing text, metadata, cookie names, and email templates updated
- VS Code extension: ~80 command IDs and configuration sections renamed`,
  },
  {
    title: "WebSocket-Based Extension & Backend Security Audit",
    version: "v1.0.0",
    type: "security",
    publishedAt: ts("2026-03-09T14:55:00Z"),
    content: `Replaced HTTP polling in the VS Code extension with persistent WebSocket subscriptions — reducing API costs from ~744 calls/hour/user to near-zero.

### Performance
- Revocation detection and variable metadata monitoring now use reactive Convex WebSockets
- Fixed N+1 queries in audit logs, permissions, project access, and invitations
- Added database indexes for audit log filtering and scheduled cleanup

### Security Hardening
- User search scoped to organization level (prevents cross-org enumeration)
- CLI session codes strengthened: 12 characters, 5-minute expiry
- Rate limiting with token bucket and fixed window strategies
- Cron jobs for automatic cleanup of expired tokens and sessions`,
  },

  // ============================================================
  // v1.0.0 — Landing Page & Public Pages (2026-03-09 – 2026-03-10)
  // ============================================================
  {
    title: "Terminal-Themed Landing Page",
    version: "v1.0.0",
    type: "feature",
    publishedAt: ts("2026-03-09T19:04:00Z"),
    content: `Launched the production landing page with a terminal-inspired dark theme.

### Design
- 10 different landing page variants explored — terminal theme selected as the final design
- Real CLI commands integrated with accurate flags and descriptions
- Comprehensive documentation page covering CLI, VS Code Extension, Web Dashboard, Security, and RBAC
- Pricing section with free alpha tier and upcoming pro tier
- All icons standardized to Lucide React for professional consistency`,
  },
  {
    title: "VS Code Extension Dashboard & Commit Guard",
    version: "v1.0.0",
    type: "feature",
    publishedAt: ts("2026-03-09T20:01:00Z"),
    content: `Major VS Code extension upgrade with three new features.

### Webview Dashboard Panel
- Terminal-inspired dark UI matching the web app
- Project stats: linked projects, directories, variable counts
- Directory cards with sync status and quick action buttons

### Dual-Layer Env Commit Guard
- **Layer 1**: Auto-unstages \`.env\` files via Git Extension API
- **Layer 2**: Pre-commit hook prevents \`.env\` commits from outside VS Code
- Both layers are idempotent and respect existing hooks

### Enhanced Tree View
- CodeLens annotations above \`.env\` files showing sync status and variable counts
- Directory icons color-coded by sync staleness (green < 1hr, amber > 1hr, gray never)
- Structured logging with timestamps via shared output channel`,
  },
  {
    title: "Public Pages Redesign",
    version: "v1.0.0",
    type: "improvement",
    publishedAt: ts("2026-03-10T08:26:00Z"),
    content: `Extended the terminal-dark theme across all public-facing pages.

### Pages Updated
- **Changelog** — Terminal-style filter buttons with timeline display
- **Wishlist** — Feature request cards with upvote functionality and Kanban roadmap view
- **Privacy Policy** — Sticky sidebar TOC with active section highlighting, covers GDPR, CCPA, and Asia-Pacific regulations
- **Terms of Service** — Same interactive sidebar navigation
- Consistent green accents, monospace fonts, and command-style labels throughout`,
  },

  // ============================================================
  // v1.0.0 — RBAC & Infrastructure (2026-03-10)
  // ============================================================
  {
    title: "CLI Role Awareness & Safety Checks",
    version: "v1.0.0",
    type: "feature",
    publishedAt: ts("2026-03-10T08:28:00Z"),
    content: `Added role-based access control awareness to the CLI, completing the backend enforcement already in place.

### Role Awareness
- CLI displays user's role per organization
- Pre-push warnings for members with confirmation prompt
- Enhanced feedback for pending requests
- Member-specific notices on pull/list operations

### Safety Checks
- Blocks push/pull if \`.env\` files are tracked by git
- Auto-suggests \`git rm --cached\` commands
- Warning on init if \`.env\` files are already tracked

### Release Infrastructure
- Standalone binary builds for 5 platforms (macOS arm64/x64, Linux x64/arm64, Windows x64)
- Curl install script with automatic platform detection`,
  },
  {
    title: "VS Code Extension Build-Time Configuration",
    version: "v1.0.0",
    type: "improvement",
    publishedAt: ts("2026-03-10T08:27:00Z"),
    content: `Replaced hardcoded localhost URLs in the VS Code extension with build-time environment injection.

- \`ENVPILOT_SERVER_URL\` environment variable injected at build time via esbuild
- Falls back to \`http://localhost:3000\` for local development
- Users can override via VS Code setting \`envpilot.serverUrl\`
- Enables publishing to the VS Code Marketplace without localhost dependencies`,
  },
  {
    title: "Convex Production Deployment Automation",
    version: "v1.0.0",
    type: "improvement",
    publishedAt: ts("2026-03-10T07:53:00Z"),
    content: `Automated Convex backend deployments to production.

- GitHub Actions workflow automatically deploys Convex functions when \`convex/\` files change on main
- Environment variables declared in \`turbo.json\` to resolve Vercel build warnings
- Uses \`CONVEX_DEPLOY_KEY\` secret for secure automated deployments`,
  },
  {
    title: "Project-Level RBAC",
    version: "v1.0.0",
    type: "feature",
    publishedAt: ts("2026-03-10T10:20:00Z"),
    content: `Extended access control from organization-level to project-level with three tiers.

### Project Roles
- **Viewer** — Read-only access to assigned projects
- **Developer** — Can submit variable change requests
- **Manager** — Full project control, can approve variable requests

### Changes
- Members now see only projects they're explicitly assigned to
- Admins can restrict whether team leads can create projects
- Projects and roles can be assigned during team member invitation
- Email delivery now shows visible error feedback instead of failing silently`,
  },
  {
    title: "Project-Level RBAC Across All Clients",
    version: "v1.0.0",
    type: "feature",
    publishedAt: ts("2026-03-10T13:28:00Z"),
    content: `Completed project-level RBAC propagation to CLI, VS Code extension, and web dashboard.

### Server-Side Enforcement
- All variable write endpoints enforce project-level roles
- Hard blocks for viewers, request workflows for developers
- Project managers can approve variable requests for their projects

### Client Updates
- CLI commands display project roles alongside org roles
- VS Code extension shows roles in tree view headers
- Dashboard sidebar shows pending requests badge for admins and team leads
- CLI default API URL set to production (\`envpilot.dev\`)`,
  },

  // ============================================================
  // v1.1.0 — UX Improvements (2026-03-10)
  // ============================================================
  {
    title: "Lucide Icons, Slug URLs & Variable Creation Drawer",
    version: "v1.1.0",
    type: "feature",
    publishedAt: ts("2026-03-10T15:34:00Z"),
    content: `Three major UX improvements to the web dashboard.

### Lucide SVG Project Icons
- Replaced emoji-based project icons with Lucide React SVGs
- Consistent rendering across all platforms and browsers
- Legacy emoji mapping preserved for backward compatibility

### Slug-Based Organization URLs
- URLs now use human-readable slugs instead of database IDs
- Example: \`/organizations/my-org\` instead of \`/organizations/kd72yqb94a0f...\`
- Server-side slug resolution — internal systems still use Convex IDs

### Variable Creation Drawer
- Vercel-style slide-out drawer replaces the centered modal
- Single-variable entry and bulk \`.env\` paste modes
- Real-time parsing, preview, and per-entry error handling
- \`Cmd/Ctrl+K\` keyboard shortcut to open`,
  },
  {
    title: "Organization Context Sync Fix",
    version: "v1.1.0",
    type: "fix",
    publishedAt: ts("2026-03-10T16:46:00Z"),
    content: `Fixed a critical bug where projects created in one organization would silently land in a different organization.

### Root Cause
React state wasn't updating when the active organization cookie changed, causing a stale org context during project creation.

### Fix
- Event-driven auth state sync via custom DOM events on cookie change
- Org context refresh on navigation and project creation
- Active org name indicator added to project form for visual confirmation
- \`organizationId\` now explicitly passed through all API calls across web, CLI, and extension`,
  },
  {
    title: "Session Management & Copy Protection",
    version: "v1.1.0",
    type: "security",
    publishedAt: ts("2026-03-10T20:38:00Z"),
    content: `New session management dashboard and security hardening across all clients.

### Session Management
- Expandable sessions panel showing active CLI and extension sessions per team member
- Selective revocation of individual tokens with real-time cleanup
- Email notifications sent to affected users on revocation

### Security Fixes
- **Critical**: CLI tokens are now properly revoked when a member is removed from the organization
- Copy/paste blocking for protected \`.env\` files (non-writable roles)
- Synced secrets automatically deleted when the VS Code extension deactivates

### Backend
- New Convex mutations for session queries and revocation with full audit logging
- Real-time permission revocation events via WebSocket subscriptions`,
  },
  {
    title: "Pagination, Animations & Audit Logs",
    version: "v1.1.0",
    type: "feature",
    publishedAt: ts("2026-03-10T21:48:00Z"),
    content: `Comprehensive UX polish across the dashboard.

### Pagination & Animations
- Client-side pagination (10 per page) with smooth staggered entrance animations
- Applied across 7 dashboard list views: projects, variables, orgs, audit logs, members, and more
- Terminal-styled pagination controls with page indicators

### Variable Operations
- Eye button reveals encrypted values via Vault API (decrypt on demand)
- Copy button for revealed values
- Edit variable modal converted to drawer style for consistency
- Delete confirmation dialogs

### Audit Logs (Now Live)
- Connected to real Convex backend with server-side pagination
- Summary stats: total events, security events, sensitive access count
- Filter by category and date range
- CSV export of current view, JSON export of full date range
- Animated rows with severity color coding`,
  },

  // ============================================================
  // v1.2.0 — Tier System & Lifecycle (2026-03-14 – 2026-03-16)
  // ============================================================
  {
    title: "Tier Limits Enforcement & Usage Dashboard",
    version: "v1.2.0",
    type: "feature",
    publishedAt: ts("2026-03-15T18:46:00Z"),
    content: `Introduced the tier limits enforcement system with a usage dashboard.

### Tier Limits
- **Free tier**: 3 projects, 50 variables, 3 team members
- **Pro tier**: Unlimited (coming soon)
- Server-side enforcement in Convex mutations with clear error messages
- Client-side UI gates with upgrade prompts
- Feature flag to disable enforcement during pre-alpha (\`ENFORCE_TIER_LIMITS\`)

### Usage & Plan Dashboard
- Resource meters showing current usage vs limits
- Per-project variable breakdown
- Feature availability matrix per tier
- Zustand store with WebSocket-synced caching to reduce database pressure

### CLI & Extension
- New \`envpilot usage\` command showing tier status and resource consumption
- Usage endpoints for both CLI and VS Code extension

### VS Code Extension Sign-In Fix
- Fixed critical bug where empty server URL config produced \`file:///\` URLs instead of HTTP
- Clipboard-first URL opening — always copies the auth URL before attempting to open browser`,
  },
  {
    title: "Project & Organization Lifecycle Management",
    version: "v1.2.0",
    type: "feature",
    publishedAt: ts("2026-03-16T17:44:00Z"),
    content: `Complete lifecycle management for projects and organizations.

### Organization Operations
- **Ownership transfer** — preserves all data (projects, variables, members, settings)
- **Organization deletion** — full cascading cleanup of all related data
- Branded email notifications for ownership transfers and membership changes

### Project Operations
- **Project deletion** with cascading cleanup (variables, versions, permissions, tokens)
- **Project move** between organizations with data preservation
- **Variable export** in \`.env\` and \`.json\` formats, filtered by environment

### Navigation Redesign
- Collapsible sidebar with smooth transitions
- Context-aware navigation: org-level vs project-level items
- Org admins shown in project members list with "implicit access" badge

### Global Search (Cmd+K)
- Vercel-style command palette for searching variables across all organizations
- Full RBAC enforcement — users only see variables they have access to
- Environment filter chips, keyboard navigation, debounced search

### Account Settings
- Profile save, session management with bulk revocation
- Notification preferences with 4 toggle categories
- Connected account info card`,
  },
  {
    title: "Organization Switching Fix",
    version: "v1.2.0",
    type: "fix",
    publishedAt: ts("2026-03-16T19:31:00Z"),
    content: `Eliminated 502 Bad Gateway errors when switching between organizations.

### Root Cause
Race condition between cookie update, React state, and server-side Convex queries caused doubled requests during org transitions.

### Fix
- Removed redundant \`router.refresh()\` from org switcher
- Added 100ms delay before navigation for auth state propagation
- Auto-retry (up to 2 attempts) in error boundaries for transient failures
- Graceful error handling in dashboard layout for Convex query failures`,
  },

  // ============================================================
  // v1.3.0 — Observability & Multi-Project (2026-03-16 – 2026-03-17)
  // ============================================================
  {
    title: "Sentry Error Tracking",
    version: "v1.3.0",
    type: "feature",
    publishedAt: ts("2026-03-16T21:40:00Z"),
    content: `Centralized error tracking across all three client surfaces via Sentry.

### Coverage
- **Web app**: Browser, server, and edge initialization with error boundary integration
- **CLI**: Async error handling with Sentry flush before process exit
- **VS Code extension**: Command wrapping with error capture and sourcemap generation
- **API routes**: All errors captured via \`handleApiError()\`

### Privacy
- \`beforeSend\` hooks scrub secrets, tokens, authorization headers, and file paths
- Free tier optimization: sampling and session replay disabled
- Expected errors (auth redirects, validation) filtered from reporting`,
  },
  {
    title: "Update Notification System",
    version: "v1.3.0",
    type: "feature",
    publishedAt: ts("2026-03-16T22:20:00Z"),
    content: `Version checking is now active across all client surfaces.

- **Web dashboard**: Terminal-themed notification banner, polls every 5 minutes
- **CLI**: Update notice after commands (throttled to once per hour)
- **VS Code extension**: Info notification on activation (throttled daily)

All checks are non-blocking and fail silently on network errors.`,
  },
  {
    title: "Multi-Project Support & Sync Command",
    version: "v1.3.0",
    type: "feature",
    publishedAt: ts("2026-03-17T09:38:00Z"),
    content: `Multi-project workflows for both CLI and VS Code extension, plus a new one-command setup.

### CLI — New Commands
- **\`envpilot sync\`** — one command does everything: login, select org/project/env, pull variables, protect files, install commit guard
- **\`init --add\`** — link additional projects (admin/team_lead only)
- **\`envpilot unlink\`** — remove a linked project
- **\`pull --all\`** / **\`pull --project\`** — pull all or specific linked projects
- **\`push --project\`** — push to a specific linked project
- **\`switch --active\`** — switch between linked projects
- **\`list linked\`** — show all linked projects

### VS Code Extension
- Multi-project linking for admin and team lead roles
- Project picker UI for ambiguous actions
- Status bar, tree view, and sync flows handle multiple linked projects

### Security
- Pre-commit hook blocks all \`.env*\` files from being committed (worktree-aware)
- Role-based file protection: \`chmod 444\` for non-admin/team_lead roles
- Default output changed to \`.env.local\` for consistency`,
  },

  // ============================================================
  // v1.4.0 — Analytics & Power Features (2026-03-17)
  // ============================================================
  {
    title: "Environment Diff View",
    version: "v1.4.0",
    type: "feature",
    publishedAt: ts("2026-03-17T14:11:00Z"),
    content: `Compare environment variables across dev, staging, and production with a GitHub-style diff interface.

- Side-by-side comparison with inline difference highlighting
- Expandable detail panels for each variable
- Global reveal toggle for on-demand batch decryption
- "Compare" button added to project header
- Mobile responsive card-based layout
- Smooth Framer Motion animations for loading, filtering, and expanding`,
  },
  {
    title: "Keyboard Shortcuts & Bulk Operations",
    version: "v1.4.0",
    type: "feature",
    publishedAt: ts("2026-03-17T16:52:00Z"),
    content: `Customizable keyboard shortcuts and bulk variable management.

### Keyboard Shortcuts
- 10 built-in shortcuts for navigation, actions, and selection
- Rebindable in Settings > Customization tab
- Bindings sync across devices via Convex database
- Help dialog accessible via \`Shift+?\`

### Bulk Operations
- Multi-select with checkboxes on variable rows
- Floating action bar for bulk deletion with RBAC enforcement
- Select all / deselect all controls

### Other
- Favorite projects with star toggle and sort option
- Enhanced audit log export with date range presets (24h, 7d, 30d, 90d, all time)`,
  },
  {
    title: "TanStack Query Integration",
    version: "v1.4.0",
    type: "improvement",
    publishedAt: ts("2026-03-17T18:44:00Z"),
    content: `Replaced ad-hoc fetch patterns with structured data fetching via TanStack Query v5.

- Typed API client with centralized error handling
- Query hooks for all endpoints with proper cache invalidation
- Type-safe query key factory for cache management
- Smart retry: 4xx never retries, 5xx/network retries once
- Three-layer Sentry integration: network failures, query errors, breadcrumbs
- Error pages only show when truly no cached data exists`,
  },

  // ============================================================
  // v1.5.0 — Analytics Dashboard & Server-Side Tiers (2026-03-18)
  // ============================================================
  {
    title: "Dashboard Analytics with Charts",
    version: "v1.5.0",
    type: "feature",
    publishedAt: ts("2026-03-18T08:31:00Z"),
    content: `Comprehensive analytics dashboard with 6 visualization sections.

### Charts
- **Activity Overview** — daily event area chart
- **Most Active Projects** — event count bar chart
- **Variable Changes** — stacked bar chart (create/update/delete per project)
- **Top Team Members** — user activity horizontal bar chart
- **Security Insights** — security metrics card grid
- **Resource Breakdown** — resource type donut chart

### Access Control
- Analytics restricted to admin and team lead roles
- Members automatically redirected, nav item hidden
- Optimized to single unified query (eliminates duplicate data fetches)`,
  },
  {
    title: "Server-Side Tier Enforcement",
    version: "v1.5.0",
    type: "security",
    publishedAt: ts("2026-03-18T11:05:00Z"),
    content: `Moved all tier enforcement from client-side to server-side for security.

- Created separate locked-down \`organizationTiers\` table
- Stripe webhook mutations converted to \`internalMutation\` with a single public gateway
- Replaced client-side \`NEXT_PUBLIC_ENFORCE_TIER_LIMITS\` with server-side \`ENFORCE_TIER_LIMITS\`
- All API routes and React components now query tier data from the backend
- Data migration to move tier field from organizations table to dedicated table`,
  },
  {
    title: "Framework Logo Icons",
    version: "v1.5.0",
    type: "feature",
    publishedAt: ts("2026-03-18T13:51:00Z"),
    content: `Projects can now use real framework logos instead of generic icons.

### Supported Frameworks
28+ options including Next.js, Flutter, Convex, Rails, Django, Laravel, Astro, Svelte, Vue, Angular, T3 Stack, PostHog, and more.

### How It Works
- Framework logos stored as \`"framework:<type>"\` prefix — no schema migration needed
- Inline SVGs for select logos, SVGL CDN for the rest
- Logos render without background color for clean visual distinction

### Project Creation Redesign
- Template selection auto-sets the framework logo
- Single-page master-detail layout: template selector left, sticky form right
- "Switch to custom icon" option for manual selection`,
  },

  // ============================================================
  // v1.6.0 — SEO, Admin & Bot Protection (2026-03-18)
  // ============================================================
  {
    title: "SEO & Sitemap Support",
    version: "v1.6.0",
    type: "improvement",
    publishedAt: ts("2026-03-18T16:34:00Z"),
    content: `Improved search engine visibility with proper SEO infrastructure.

- Dynamic sitemap generation for all 8 public pages with appropriate change frequencies
- \`robots.txt\` allowing crawling of public pages while blocking protected routes
- Open Graph and Twitter Card meta tags on root layout
- Canonical URLs and Google bot directives with rich snippet support`,
  },
  {
    title: "Dynamic Tiers & Admin Dashboard",
    version: "v1.6.0",
    type: "feature",
    publishedAt: ts("2026-03-18T18:06:00Z"),
    content: `Replaced hardcoded free/pro tiers with a fully dynamic, database-backed tier system.

### Dynamic Tier System
- New \`tierDefinitions\` table with name, display properties, pricing, and feature limits
- Tier CRUD endpoints: create, update, delete, seed defaults
- Tier enforcement toggle for pre-alpha mode
- All hardcoded tier types replaced with dynamic string-based tier names

### Admin Dashboard
- Analytics section with platform-wide metrics
- Tier management: create, edit, and delete tiers
- User controls and platform configuration
- All admin panel components properly typed with Convex types`,
  },
  {
    title: "BotID API Protection",
    version: "v1.6.0",
    type: "security",
    publishedAt: ts("2026-03-18T20:34:00Z"),
    content: `Vercel BotID bot detection added across 44 API mutation endpoints.

### Coverage
- Variables, projects, organizations, billing, templates, vault, and user operations
- Client-side route config aligned with server-side handlers

### UI Improvements
- Custom dark-themed checkboxes and radios with green accent
- Custom scrollbars and centered full-page loading states
- Integrations settings updated with Cursor, Antigravity, and Open VSX support`,
  },
  {
    title: "Sitemap Authentication Fix",
    version: "v1.6.0",
    type: "fix",
    publishedAt: ts("2026-03-18T22:17:00Z"),
    content: `Fixed sitemap.xml and robots.txt returning 401 errors to search engine crawlers.

The auth middleware was blocking unauthenticated access to these routes. Added both paths to \`unauthenticatedPaths\` so Google Search Console and other crawlers can access them.`,
  },

  // ============================================================
  // v1.7.0 — Dynamic Feature Registry (2026-03-19)
  // ============================================================
  {
    title: "Dynamic Feature Registry & Tier Enforcement",
    version: "v1.7.0",
    type: "feature",
    publishedAt: ts("2026-03-19T15:53:00Z"),
    content: `Fully dynamic, database-driven feature registry replacing all hardcoded feature flags. Every gatable feature in the platform is now managed through a central registry.

### How It Works
- **18 platform features** registered with key, display name, value type, category, and defaults
- **Resolver chain**: org → createdBy → userTiers → grace period → tierFeatures → defaults
- **Backend enforcement**: \`checkBooleanFeature\` and \`checkNumericLimit\` helpers in Convex mutations
- **Frontend enforcement**: \`<FeatureGate>\` component and \`useFeatureGate\` hook
- **Auto-bypass**: All enforcement disabled when Tier Enforcement admin toggle is OFF

### Features Gated
- Version history, bulk delete, granular permissions, custom branding
- Keyboard shortcut customization, analytics retention, audit log retention
- SSO, priority support, and all resource limits (projects, variables, members)

### Dynamic Pricing Page
- Feature comparison table populated from the database
- Terminal-themed UI matching the landing page

### Grace Period Support
- Banner component warns users when their tier is about to expire
- Resolver respects grace periods before downgrading feature access`,
  },

  // ============================================================
  // v1.2.0 (Admin) / v1.7.1 (Web) — Kanban, Wishlist & Migrations (2026-03-20)
  // ============================================================
  {
    title: "Admin Feature Requests Kanban Board",
    version: "v1.2.0",
    type: "feature",
    publishedAt: ts("2026-03-20T12:00:00Z"),
    content: `Complete rewrite of the admin feature requests page into a professional Kanban board with drag-and-drop, full-screen detail modals, and team feature creation.

### Kanban Board
- Six status columns: Submitted → Under Review → Planned → In Progress → Completed → Declined
- **Drag-and-drop** powered by @dnd-kit — drag cards between columns to update status
- Animated drag overlay with column-matched theming, tilt effect, and target indicator
- Hover-reveal action icons on each card (open detail, delete)

### Full-Screen Detail Modal
- Spacious two-column layout: description, "Move to" status buttons, admin notes on the left; metadata sidebar on the right
- **State management** via Zustand — unsaved admin notes persist across accidental closes
- Dirty-check guard with confirm dialog on backdrop click, Escape, or close button
- "Unsaved changes" indicator next to the Save button

### Team Feature Creation
- "Add Feature" panel with title, description, category, status picker, and admin notes
- Zustand-managed form state with discard confirmation for dirty forms
- Features submitted as "Envpilot Team" on the public roadmap

### Bulk Operations
- "Clear All" button with destructive confirm dialog to mass-delete all feature requests and votes
- Per-card delete with hover-reveal trash icon

### Categorized Migrations UI
- Migrations page grouped into 4 categories: Feature & Tier System, Content Seeding, Destructive, One-Time
- Color-coded category headers with icons, descriptions, and count badges
- Priority ordering within groups, safety badges (safe to re-run / destructive / run once)
- Confirm dialogs for destructive and one-time migrations`,
  },
  {
    title: "Public Wishlist Collapsible Roadmap",
    version: "v1.7.1",
    type: "improvement",
    publishedAt: ts("2026-03-20T12:00:00Z"),
    content: `The public wishlist roadmap columns (Planned, In Progress, Completed) now collapse to show the first 4 items by default.

- "Show N more" / "Show less" toggle with column-colored styling
- Smooth expand/collapse transitions
- Prevents the roadmap from becoming overwhelming as features accumulate`,
  },
  {
    title: "Feature Request Seed Data",
    version: "v1.2.0",
    type: "improvement",
    publishedAt: ts("2026-03-20T12:00:00Z"),
    content: `Added seed data for 18 planned team features based on FEATURES.md, available as a one-click migration.

- 14 planned features: GitHub CI/CD, VS Code Marketplace, secret rotation, Docker injection, env diff, Slack notifications, and more
- 2 in-progress features: Webhook events, project-level .env templates
- 2 under-review features: GraphQL API, multi-region vault replication
- Idempotent seeding — safe to run multiple times without duplicates`,
  },
];

// ==========================================
// SEED FUNCTION
// ==========================================

/**
 * Seed the changelog table with all historical entries.
 * Strict dedup: matches on (version + title). If an entry already exists it is
 * never re-inserted. If multiple rows share the same version+title (legacy
 * duplicates), extras are deleted so only one remains.
 * Safe to run multiple times — fully idempotent.
 */
export const seedChangelog = internalMutation({
  handler: async (ctx) => {
    let created = 0;
    let skipped = 0;
    let deduped = 0;
    const now = Date.now();

    for (const entry of SEED_CHANGELOG) {
      // Fetch all rows for this version
      const existing = await ctx.db
        .query("changelog")
        .withIndex("by_version", (q) => q.eq("version", entry.version))
        .collect();

      // Find ALL rows matching this exact title (catch duplicates)
      const matches = existing.filter((e) => e.title === entry.title);

      if (matches.length > 0) {
        // Keep the first one, delete any duplicates
        for (let i = 1; i < matches.length; i++) {
          await ctx.db.delete(matches[i]._id);
          deduped++;
        }
        // Already exists — skip, do not re-insert or update
        skipped++;
        continue;
      }

      // Does not exist yet — insert
      await ctx.db.insert("changelog", {
        title: entry.title,
        content: entry.content,
        version: entry.version,
        type: entry.type,
        isPublished: true,
        publishedAt: entry.publishedAt,
        createdAt: entry.publishedAt,
        updatedAt: now,
      });
      created++;
    }

    return {
      success: true,
      total: SEED_CHANGELOG.length,
      created,
      skipped,
      duplicatesRemoved: deduped,
    };
  },
});

// ==========================================
// CLEAR ALL CHANGELOGS
// ==========================================

/**
 * Delete every row in the changelog table.
 * Use this to wipe the table before re-seeding or to start fresh.
 */
export const clearAll = internalMutation({
  handler: async (ctx) => {
    const all = await ctx.db.query("changelog").collect();
    for (const entry of all) {
      await ctx.db.delete(entry._id);
    }
    return { success: true, deleted: all.length };
  },
});
