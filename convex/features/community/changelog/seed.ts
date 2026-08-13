/**
 * Changelog — Seed Data
 */

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
- Polar.sh webhook mutations converted to \`internalMutation\` with a single public gateway
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

  // ============================================================
  // v1.27.0 — Trustworthy Rollback & Error Notifications (2026-07-04)
  // ============================================================
  {
    title: "Trustworthy Version Rollback & Error Notifications",
    version: "v1.27.0",
    type: "fix",
    publishedAt: ts("2026-07-04"),
    content: `Variable rollback now restores the actual secret value, not just settings — and the app is honest about the one case where it still can't.

### Trustworthy Rollback
- Every value edit now creates an immutable version snapshot of the real secret value, not just metadata
- Rolling back to a version restores that historical value into the vault, not just settings like environment scoping
- Rollback confirmations now state exactly what was restored (value and settings, or settings only)

### Honest Legacy Disclosure
- Versions created before this release did not retain their historical value, so there is nothing to restore for them
- Rolling back to one of those legacy versions now explicitly restores settings only, and says so, instead of implying a full restore
- This is a one-time limitation from the previous storage model — every version created from this release forward is fully restorable

### Error Notifications
- Actions that fail (permission errors, tier limits, unexpected failures) now surface a toast notification instead of failing silently
- Covers rollback, variable edits, and other mutation flows across the dashboard`,
  },

  // ============================================================
  // v1.28.0 — Deletion Becomes Real (2026-07-04)
  // ============================================================
  {
    title: "Deletion Becomes Real: 7-Day Trash, Then Permanent Purge",
    version: "v1.28.0",
    type: "feature",
    publishedAt: ts("2026-07-04T15:00:00Z"),
    content: `When you delete a secret, it is now actually destroyed — a 7-day trash window, then a permanent purge that removes the encrypted value from the vault itself.

### The New Deletion Model
- Deleting a variable or shared account moves it to trash for 7 days
- After 7 days, a daily purge permanently destroys both the database record **and** every backing vault object — including full version history
- Delete dialogs now tell you exactly what will happen: "restorable for 7 days, then permanently deleted, including the stored secret value"

### Restore From Trash
- New "Recently deleted" section on the project page shows trashed variables and accounts with a days-left countdown
- One-click Restore brings an item back — shared accounts gain a restore path for the first time
- Items past the 7-day window can never be restored, so a purge can never race a restore

### Cascade Fixes
- Deleting a project or organization now correctly sweeps its shared accounts too
- A project restored within 7 days keeps its full variable version history

### Performance
- Faster dashboard and search: global search, usage stats, and permission checks now use bounded, indexed reads instead of full-table scans`,
  },

  // ============================================================
  // v1.30.0 — Server-Verified Identity Everywhere (2026-07-06)
  // ============================================================
  {
    title: "Auth Overhaul: Server-Verified Identity on Every Surface",
    version: "v1.30.0",
    type: "security",
    publishedAt: ts("2026-07-06T08:00:00Z"),
    content: `The biggest security release in Envpilot's history — every request from the web app, CLI, and VS Code extension now carries a cryptographically verified identity, and all secret encryption happens inside the backend.

### Verified Identity Everywhere
- The backend no longer trusts any client-supplied user identity — every operation derives who you are from a verified WorkOS AuthKit JWT
- Impersonation by crafted requests is now impossible: the server resolves the actor itself, on every call
- Billing, subscription, and tier information can only be read by the account that owns it

### New CLI & Extension Login: Device Flow
- \`envpilot login\` now uses the industry-standard device authorization flow — a code appears in your terminal, you approve it in the browser, done
- The CLI and extension hold short-lived access tokens with automatic refresh, instead of long-lived custom tokens
- Signing out a device from the web dashboard now revokes the session remotely — the device's tokens stop working immediately
- All CLI and extension traffic runs over the same authenticated real-time connection as the web app

### Vault Crypto Moved Into the Backend
- Secret encryption and decryption now happen entirely inside the backend — the web server no longer handles vault cryptography
- Revealing a value (the eye icon, diffs) is authorized by reverse-looking-up who owns that exact secret before anything is decrypted — unknown or inaccessible references fail closed
- Zero data migration required: every existing secret keeps resolving byte-for-byte`,
  },
  {
    title: "Smarter Client Version Enforcement",
    version: "v1.30.0",
    type: "improvement",
    publishedAt: ts("2026-07-06T10:00:00Z"),
    content: `The CLI and VS Code extension now know when they're outdated — and tell you before anything breaks.

### Two-Tier Enforcement
- **Behind the latest version** → a soft "update available" notice; your command still runs
- **Below the minimum supported version** → a clear upgrade prompt before anything runs, instead of a confusing failure against a changed backend
- Version checks fail open on network errors — a flaky connection never locks you out

### Under the Hood
- The CLI checks before your command runs, not after
- The extension shows an update prompt and pauses commands until you're current`,
  },

  // ============================================================
  // v1.31.0 — Homebrew & Polish (2026-07-09)
  // ============================================================
  {
    title: "Install the CLI with Homebrew",
    version: "v1.31.0",
    type: "feature",
    publishedAt: ts("2026-07-09T19:45:00Z"),
    content: `The Envpilot CLI is now available via Homebrew — plus a friendlier experience when authentication goes wrong.

### Homebrew Distribution
- \`brew install rafay99-epic/apps/envpilot\` — one command, no npm required
- The formula updates automatically with every CLI release

### Dedicated Auth Error Page
- Session or token problems in the dashboard now land on a clear, terminal-styled error page with Try Again and Sign In actions — instead of a crash
- Transient sign-in races retry themselves automatically before you ever see an error
- Raw server error details are never shown in production`,
  },

  // ============================================================
  // v1.33.0 — Pro Plans Are Live (2026-07-10)
  // ============================================================
  {
    title: "Pro Plans Are Live",
    version: "v1.33.0",
    type: "feature",
    publishedAt: ts("2026-07-10T22:15:00Z"),
    content: `You can now subscribe to Envpilot Pro with a card — real payments, powered by Polar.

### Subscribe to Pro
- Upgrade from the pricing page or your usage page; checkout is handled securely by Polar
- Your plan activates the moment payment completes, and Pro features unlock instantly across web, CLI, and extension

### Hardened for Real Money
- The entire billing pipeline was audited and production-hardened before go-live
- Payment events can never be silently dropped — if activation hits a hiccup, the payment provider automatically retries until your tier is granted
- Webhook processing is verified end-to-end so tier grants can only come from genuine payment events
- Plan changes, cancellations, and grace periods all resolve to the correct tier, even with out-of-order events`,
  },

  // ============================================================
  // v1.34.0 — CI/CD Service Tokens & GitHub Action (2026-07-11)
  // ============================================================
  {
    title: "GitHub Action & CI/CD Service Tokens",
    version: "v1.34.0",
    type: "feature",
    publishedAt: ts("2026-07-11T00:30:00Z"),
    content: `Pull your environment variables straight into CI — one revocable Envpilot token in GitHub instead of dozens of copy-pasted secrets.

### The Official GitHub Action
\`\`\`yaml
- uses: rafay99-epic/envpilot-action@v1
  with:
    token: \${{ secrets.ENVPILOT_TOKEN }}
    environment: production
\`\`\`
- Exports your variables to the workflow environment or a dotenv file
- Every value is masked in workflow logs before it is ever exported — keys and values are never printed

### Service Tokens (Pro)
- Read-only machine tokens scoped to one project and explicit environments — created in Project → Settings → CI/CD Tokens
- The token is shown exactly once at creation; only a hash is ever stored
- Revocation is immediate, every pull is audit-logged, and tokens can't be repointed to another project
- Hand a production token to a DevOps engineer or CI system without creating an Envpilot account for it`,
  },

  // ============================================================
  // v1.35.0 — Public API & MCP Server (2026-07-11)
  // ============================================================
  {
    title: "Envpilot Becomes a Platform: Public REST API & MCP Server",
    version: "v1.35.0",
    type: "feature",
    publishedAt: ts("2026-07-11T08:15:00Z"),
    content: `A public REST API, a remote MCP server for AI assistants, and a unified API-key system to power them both — Envpilot is now a platform you can build on. Both surfaces are Pro features.

### API Keys
- Create org-scoped API keys in Organization → Settings → API Keys
- Fine-grained scopes: all projects or a specific list, chosen environments, chosen resources (variables, accounts, projects), optional expiry with countdown badges
- One-time reveal at creation, instant revocation, every denial audited
- Existing CI/CD service tokens keep working unchanged

### REST API v1
- \`/api/v1/organization\`, \`/api/v1/projects\`, \`/api/v1/projects/{slug}/variables\`, \`/api/v1/projects/{slug}/accounts\`
- Filter by environment, key list, or prefix; fetch metadata-only or ready-to-use \`format=env\` output
- Fail-loud by design: you get complete, correct data or a clear error — never partial results or placeholder values
- Per-key rate limits, uniform errors that never leak whether a resource exists outside your scope

### MCP Server for AI Assistants
- Point Claude Code, Claude Desktop, or Cursor at \`/api/mcp\` with an Envpilot API key
- Five read-only tools let your AI list projects, read variables, and search your scoped configuration
- Every tool call passes through the exact same authorization core as the REST API

### Documentation
- Five new docs pages: API quickstart, full API reference, MCP server setup, GitHub Action guide, and API security model`,
  },

  // ============================================================
  // v1.36.0 — Security Hold & Offboarding (2026-07-11)
  // ============================================================
  {
    title: "Security Hold: Freeze a Member's Access Instantly",
    version: "v1.36.0",
    type: "security",
    publishedAt: ts("2026-07-11T19:00:00Z"),
    content: `For "their laptop just leaked" moments — suspend a member's access org-wide without removing them, and reinstate them exactly as they were.

### Security Hold (Pro)
- Suspend any member from the members page: every access path is denied immediately — web, CLI, extension, API, and MCP
- All of their sessions are killed, and their extension deletes synced \`.env\` files from the compromised machine
- Membership, role, project assignments, and per-variable grants stay intact — reinstating restores the exact prior state with nothing to rebuild
- Every suspend and reinstate is audit-logged

### Better Removal Experience
- Removed members now see a clear "your access to this organization has been revoked" screen instead of the org silently vanishing
- Users with no organizations left get a path to create their own workspace

### Extension Cleans Up After Itself
- Uninstalling the VS Code extension now deletes the \`.env\` files it synced — plaintext secrets no longer linger on offboarded machines
- Files you hand-edited since the last sync are always spared, and updates/reloads never trigger a purge`,
  },

  // ============================================================
  // v1.37.0 — Project Trash Page (2026-07-11)
  // ============================================================
  {
    title: "Dedicated Project Trash Page with Empty Trash",
    version: "v1.37.0",
    type: "feature",
    publishedAt: ts("2026-07-11T19:30:00Z"),
    content: `Trash gets a real home — a dedicated page per project, with the power to purge early.

### The Trash Page
- New **Trash** link in the project header, next to Compare and Members
- Deleted variables and shared accounts in separate sections, rendered dimmed and struck-through — they are genuinely disabled while trashed
- Per-item Restore and a days-left countdown that turns red on the last day

### Empty Trash
- Permanently destroy everything in the project's trash right now, skipping the remaining retention days — with a confirmation dialog
- Vault objects are destroyed first, records only after every secret is confirmed gone; anything that can't be purged safely stays in trash and is retried automatically
- The action is audit-logged with purge counts`,
  },

  // ============================================================
  // v1.38.0 — Usage Page Revamp (2026-07-11)
  // ============================================================
  {
    title: "Usage Page Revamp",
    version: "v1.38.0",
    type: "improvement",
    publishedAt: ts("2026-07-11T21:15:00Z"),
    content: `The organization usage page has been rebuilt around clarity — see your plan, your limits, and what needs attention at a glance.

### New Layout
- **Plan strip** up top: your tier, price, an Upgrade CTA, and a "Compare plans" link
- **Alert zone**: a red/amber banner calls out any resource at or above 80% of its limit — no more surprises
- **Every quota meter is always visible**, grouped by Resources, Variables & secrets, Sharing & collaboration, and Data retention — nothing hidden behind collapsibles
- **Plan features grid** shows what your current plan includes; locked features carry a Pro chip with an Unlock CTA
- Per-project variable breakdown lives under a compact "By project" toggle

### Polish
- Creating a variable with a key that already exists now shows a friendly, actionable message in the drawer instead of a raw backend error — and the drawer stays open so you can correct it
- Bulk paste now reports exactly what happened: how many were created, which keys were skipped as duplicates, and any other failures — nothing is silently swallowed`,
  },

  // ============================================================
  // v1.39.0 — Billing Management UX (2026-07-11)
  // ============================================================
  {
    title: "Better Billing Management",
    version: "v1.39.0",
    type: "improvement",
    publishedAt: ts("2026-07-11T22:30:00Z"),
    content: `Now that real payments flow, managing your subscription got a polish pass.

### Invoices & Billing History
- New **Manage billing** link on the usage page plan strip takes you straight to the Billing tab
- From there, open Polar's hosted customer portal for invoices, receipts, and payment methods
- Settings tabs are now deep-linkable — share a URL that opens directly on Billing

### Cancellation Feedback
- Cancelling now asks why (required) — your feedback goes straight to us and shapes what we build next
- The flow is otherwise unchanged: Pro access continues until the end of your billing period, followed by a 7-day grace period

### Free Forever
- The "Alpha · Free during early access" badge is retired — the free tier is now simply **Free forever**
- FAQ, Terms, and Privacy updated to reflect the live billing flow and where to find your invoices`,
  },

  // ============================================================
  // v1.49.0 — Legacy client retirement (2026-07-18)
  // ============================================================
  {
    title: "Older CLI and Extension Versions Now Require an Update",
    version: "v1.49.0",
    type: "improvement",
    publishedAt: ts("2026-07-18T18:00:00Z"),
    content: `The platform now requires CLI **1.18.0+** and VS Code extension **1.15.0+** — the first versions built for the new role system.

### Why
- Older builds talked to server endpoints that predate the new role system; keeping both paths alive forever would slow every future release
- Affected versions now show a clear update prompt instead of failing with confusing errors

### What to do
- CLI: \`npm install -g @envpilot/cli@latest\` (or \`brew upgrade envpilot\`)
- VS Code extension: update from your editor's extension panel

Nothing else changes — projects, variables, and roles are untouched.`,
  },

  // ============================================================
  // v1.48.0 — Role Registry (2026-07-18)
  // ============================================================
  {
    title: "A New Role System: Roles Managed from the Platform",
    version: "v1.48.0",
    type: "feature",
    publishedAt: ts("2026-07-18T10:00:00Z"),
    content: `Roles are now managed from the platform itself — no more fixed role list baked into the apps.

### Roles, Managed from the Platform
- Roles live in a registry on the platform, so what each role can do is defined in one place and applied everywhere
- Two new roles are available out of the box: **Editor** (writes variables without managing the team) and **Viewer** (read-only access)

### Capability-Based Permissions Everywhere
- Permissions are now capability-based across the web app, CLI, and VS Code extension — every surface asks "what can this role do" instead of hardcoding role names
- The CLI and extension understand any role, including ones added in the future: file protection, variable requests, and command gating all follow the role's actual capabilities

### No Action Needed
- Existing users and their roles carry over exactly as they are — Owner, Project Manager, Team Lead, and Developer behave the same as before
- Older CLI and extension versions keep working unchanged`,
  },

  // ============================================================
  // v1.46.0 — VS Code Unsync-on-Close (2026-07-17)
  // ============================================================
  {
    title: "VS Code Unsync-on-Close: Secrets Never Outlive Your Editor",
    version: "v1.46.0",
    type: "feature",
    publishedAt: ts("2026-07-17T13:00:00Z"),
    content: `**Heads up — behavior change.** After updating the VS Code extension (v1.14.0), synced .env files are now removed when VS Code closes, and restored automatically on your next sync. This is ON by default for every project.

### Unsync on Close
- Closing VS Code deletes the .env files the extension synced — secrets no longer linger on disk after your session ends
- **Hand-edited files are never deleted**: a file is only removed if its content still exactly matches what Envpilot last wrote
- Crashes are covered too: if VS Code is force-quit, the cleanup runs on the next launch
- A one-time notice in the editor explains the change when it first takes effect

### Per-Project & Per-Member Control (Pro)
- Project Settings → General gets a new **VS Code Sync** section: toggle unsync-on-close per project
- Pin individual members On / Off / Inherit — an override always beats the project default
- Free tier stays locked to the secure default (unsync ON); customization is a Pro feature
- Every toggle change and every cleanup is recorded in the audit log

### Restricted Mode Support
- The extension now runs in VS Code Restricted Mode with limited powers: it never writes secrets into an untrusted workspace, but cleanup still runs
- Trusting the workspace starts sync instantly — no reload needed

### Reliability Fixes
- Restored several extension backend paths that had silently broken project linking and real-time sync for published extension builds — link, unlink, and live revocation sync work again on all versions`,
  },

  // ============================================================
  // v1.49.1 — VS Code Clipboard Lockdown & IntelliSense (2026-07-18)
  // ============================================================
  {
    title: "VS Code: Clipboard Lockdown, Value Cloaking & Secret IntelliSense",
    version: "v1.49.1",
    type: "feature",
    publishedAt: ts("2026-07-18T20:00:00Z"),
    content: `The VS Code extension (v1.16.0) gets its biggest security and productivity update yet: secrets are now locked down inside the editor, masked on screen, and available as IntelliSense — without ever showing a value.

### Clipboard Lockdown
- Copy and cut are now **blocked in every Envpilot-synced .env file, for all roles** — no more accidental secrets on the clipboard
- Covers the hidden paths too: context-menu copy and "Copy With Syntax Highlighting", with protection that survives window reloads, file renames, symlinks, and case changes
- Fully configurable: \`envpilot.clipboardGuard.scope\` — every managed file (default), read-only roles only, or off

### Value Cloaking
- Secret values render as masked bullets in synced .env files — safe for screen shares and pair programming
- "Reveal values" shows them for 30 seconds, then re-masks automatically

### Secret IntelliSense
- Your project's variable names now autocomplete inside \`process.env.\`, \`os.environ\`, \`ENV[\`, \`getenv(...)\` and more — 13 languages supported
- Hover any env reference to see its project and environments with a **masked** value; revealing requires an explicit click and the right role
- Names only, served from the local cache — values are never rendered into the editor

### Reliability Round
- Remote variable changes no longer flash a false "You cannot edit it directly" warning for read-only teammates
- Changes made while your window was idle are picked up on focus — no more silently stale .env files
- Multi-root workspaces restore every linked folder on startup, env file writes are atomic, and account switching takes effect on the live connection immediately
- Expired sessions self-heal with an automatic refresh-and-retry instead of a sign-in prompt
- Dashboard panel fixes: the per-directory Remove button works and the sync indicator no longer sticks`,
  },

  // ============================================================
  // v1.40.0 — Launch & Welcome (2026-07-12)
  // ============================================================
  {
    title: "Envpilot Is Officially Launched — Plus a Proper Welcome",
    version: "v1.40.0",
    type: "improvement",
    publishedAt: ts("2026-07-12"),
    content: `Envpilot is out of early access and officially launched — and new users now get a proper hello.

### Welcome Email
- Every new signup receives a personalized welcome email introducing the platform
- Greets you by name, sent exactly once when your account is first created
- A failed email can never interfere with your signup`,
  },

  // ============================================================
  // v1.50.0 — One Token Model (2026-07-18)
  // ============================================================
  {
    title: "One Token Model: A Single API Key for Every Machine Surface",
    version: "v1.50.0",
    type: "feature",
    publishedAt: ts("2026-07-18T21:00:00Z"),
    content: `Every machine credential — REST API, MCP server, and the GitHub Action — is now one kind of API key, minted from one place.

### Surfaces on Every Key
- New keys declare exactly where they may be used: **REST API**, **MCP server**, and/or **GitHub Action**
- A leaked key is now useless outside the surfaces it was minted for; existing keys keep working everywhere they did before
- The key list shows each key's surfaces at a glance

### GitHub Action Keys, Locked Down
- An Action credential is an API key with the GitHub Action surface — locked to exactly **one project** and the **variables** resource, the only shape CI pulls need
- The wizard steers you into that shape automatically; the backend enforces it independently

### One Place to Mint
- The project-settings CI/CD Tokens tab no longer creates tokens — it lists legacy ones for revocation and points to **Organization Settings → API Keys**
- Existing CI tokens keep working unchanged: same \`envpk_\` secret, same endpoint, nothing to rotate`,
  },

  // ============================================================
  // v1.51.0 — Machine Variable Requests (2026-07-18)
  // ============================================================
  {
    title: "AI Agents Can Now Request Variables — Humans Approve",
    version: "v1.51.0",
    type: "feature",
    publishedAt: ts("2026-07-18T22:00:00Z"),
    content: `An AI agent working through the MCP server can now ask for an environment variable it needs — and a human decides.

### Agent Requests, Human Approves
- Keys with the new opt-in **requests** resource can file a variable request over MCP, with a required justification explaining why
- Requests land in the same reviewer queue as developer requests, marked with an unmissable **automated** badge and the key's name
- The approver types the secret value at approval — agents never propose or see values they aren't scoped to read
- Machine credentials still never write secrets: a request is an ask, not a write

### Built-In Abuse Protection
- Strict per-key rate limit on filing (a few per hour), a cap on open pending requests, and a cooldown after a rejection that tells the agent why
- Requests from revoked or expired keys can't be approved, and stale machine requests auto-cancel after 30 days

### Public Rate Limits & Architecture Docs
- New docs pages: **Architecture** (the five surfaces and the trust model, with diagrams) and **Rate limits** (every machine-surface bucket, published — build against them instead of discovering them)

### Per-Key Activity
- The API Keys list now shows each key's recent pulls, denials, and requests filed

### Under the Hood
- The legacy CI/CD service-token system is fully retired — every machine credential is an API key now`,
  },

  // ============================================================
  // v1.52.0 — Faster Navigation & Next.js 16.2 (2026-07-19)
  // ============================================================
  {
    title: "Faster Dashboard Navigation on Next.js 16.2",
    version: "v1.52.0",
    type: "improvement",
    publishedAt: ts("2026-07-19T14:00:00Z"),
    content: `Moving around the dashboard is noticeably lighter — repeat navigations are instant and route bundles got smaller.

### Snappier Navigation
- Visited dashboard pages are now kept warm for three minutes instead of thirty seconds — switching between projects, variables, and team no longer re-runs the server layout on every hop
- The Trash and Shared pages resolve their project directly instead of waiting on the full project list first
- The Variables and Requests tables animate with plain CSS — a whole animation library dropped out of both routes

### Platform Upgrade
- All three apps now run **Next.js 16.2** — 25-60% faster server rendering plus smarter layout deduplication and prefetching on navigation, for free

### Polish
- Tailored loading skeletons for the data-heavy dashboard pages, shaped like the content they precede
- Dedicated error screens for project, organization, and invitation pages that distinguish "not found" from a transient failure
- The blog and docs finally have styled 404 pages — a broken link lands in the site shell with a way back, not a bare browser error
- Blog and docs pages build faster: every article and doc is parsed exactly once per build, and \`llms-full.txt\` now includes the full source of every architecture diagram`,
  },
  {
    title: "Project Lookup Hardening",
    version: "v1.52.0",
    type: "security",
    publishedAt: ts("2026-07-19T14:30:00Z"),
    content: `A defense-in-depth pass on how projects are looked up and how server logs treat credentials.

### Membership-Gated Project Lookup
- The by-slug project lookup now requires an authenticated caller with an active organization membership; members without the assignment bypass must be assigned to the project
- Machine surfaces (public API, MCP, GitHub Action) are unaffected — they authorize through their own API-key pipeline as before

### Log Hygiene
- Invitation emails and tokens no longer appear in server logs; invitation tokens are logged as a short non-reusable prefix, only for correlation`,
  },

  // ============================================================
  // v1.52.1 — Project Metadata Reads Enforce Membership (2026-07-19)
  // ============================================================
  {
    title: "Project Metadata Reads Now Enforce Membership",
    version: "v1.52.1",
    type: "security",
    publishedAt: ts("2026-07-19T20:00:00Z"),
    content: `The remaining project read paths now enforce the same visibility rule as the project list.

### What Changed
- Fetching a project by id and listing an organization's projects both require an authenticated caller with an active membership in that organization
- Members without the assignment bypass only see projects they are assigned to — matching what the dashboard already shows
- Web API routes resolve projects as the signed-in caller instead of a server-side service identity

### Who Is Affected
- Owners and admins: nothing changes
- Unassigned members: project-scoped API endpoints now answer "not found", consistent with the dashboard
- CLI, VS Code extension, public API, MCP, and the GitHub Action: unaffected — machine flows keep their own authorization pipeline`,
  },

  // ============================================================
  // CLI v1.19.0 — Terminal-First Workflow (2026-07-20)
  // ============================================================
  {
    title: "envpilot run Picks Up Variable Changes Instantly",
    version: "v1.19.0",
    type: "fix",
    publishedAt: ts("2026-07-20T09:00:00Z"),
    content: `\`envpilot run\` used to cache decrypted secrets for an hour and make no server contact within that window — so a variable you changed in the dashboard could stay invisible to \`run\` for up to an hour.

### What Changed
- Every run now does one cheap freshness check (metadata only, no secret decryption) and re-decrypts only when a variable actually changed — dashboard edits show up on the very next run
- run now tells you when accessible variables live only in another environment: "Injected 8 of 12 — 4 not in development: FOO, BAR" instead of silently dropping them
- The \`-e\` flag is validated against development / staging / production
- Decryption failures and role-scope restrictions are surfaced on every run, including cache-served ones

### Compatibility
- Pass \`--cache-ttl <seconds>\` to restore the old skip-the-check behavior for a fixed window
- Offline fallback is unchanged — a cached run still works without network, and says so`,
  },
  {
    title: "Manage Variables and Approve Requests Without Leaving the Terminal",
    version: "v1.19.0",
    type: "feature",
    publishedAt: ts("2026-07-20T09:30:00Z"),
    content: `The CLI grew the commands a terminal-first workflow was missing — no more bouncing to the dashboard for everyday changes.

### Single-Secret Edits, the Safe Way
- \`envpilot secrets set\` — a guided two-step flow: the key is validated first, then the value is typed into a MASKED prompt, so secrets never land in your shell history or on screen (\`KEY=VALUE\` inline still works for CI)
- Role-aware: if your role can't write directly, the same flow files a variable request for review instead of rejecting you
- \`envpilot secrets rm KEY\` moves a single secret to trash (recoverable from the dashboard)
- Named \`secrets\` to match what your fingers already know from other tools; \`var\` works as an alias
- Plan limits and permissions are enforced server-side and reported in plain language

### Review Requests in the Terminal
- \`envpilot requests approve|reject|cancel <id>\` — close the request-approval loop without opening the web app
- Approving a machine (valueless) request prompts for the secret MASKED and encrypts it server-side; \`--value\` exists for CI
- The request list now shows an ID column to act on

### Compare Environments
- \`envpilot diff staging production\` shows which keys differ between two environments; add \`--values\` to compare values too

### Scripting
- \`--json\` output on \`requests\` and \`diff\` for piping into other tools`,
  },

  // ============================================================
  // v1.53.0 — MCP Key Guidance & Real API Error Messages (2026-07-20)
  // ============================================================
  {
    title: "Public API and MCP Errors Say What Actually Went Wrong",
    version: "v1.53.0",
    type: "fix",
    publishedAt: ts("2026-07-20T14:00:00Z"),
    content: `In production, every denied REST or MCP request answered with an opaque error — an invalid key, a missing scope, and a rate limit all looked identical. Fixed across the whole machine-credential surface.

### What Changed
- MCP tool calls now return the real reason: \`Invalid or revoked API key\`, \`That resource is not in this API key's scope\`, \`This API key is not enabled for this surface\`, rate limits with a retry delay — instead of a generic \`Server Error\`
- REST API denials return their proper status codes again: 401 for a bad key, 403 for scope/surface/plan denials, 404 for out-of-scope projects, 429 with \`Retry-After\` for rate limits — previously all of these surfaced as 500
- The GitHub Action's secret pulls get the same treatment — a denied pull now fails with an actionable message instead of a generic server error

### Why It Was Invisible
The bug only existed in production, where the platform redacts internal error details; development builds always showed the real message. A new [Troubleshooting section](https://docs.envpilot.dev/mcp-server) in the MCP docs lists every error string and its fix.`,
  },
  {
    title: "API Key Creation Now Explains What MCP Needs",
    version: "v1.53.0",
    type: "improvement",
    publishedAt: ts("2026-07-20T14:30:00Z"),
    content: `A fresh API key could pass every form check and still fail on its first MCP call — the default scopes didn't include the \`projects\` resource that every MCP session starts with. The create-key form now makes MCP requirements impossible to miss.

### Create-Key Form
- Selecting the MCP server surface shows a live checklist mapping each resource to the MCP tools it unlocks (\`projects\` → \`envpilot_list_projects\`/\`envpilot_search\`, \`variables\` → variable reads, \`accounts\` → shared accounts, \`requests\` → variable requests)
- A warning appears when the \`projects\` resource is deselected — assistants open every session by listing projects, so a key without it fails immediately
- New keys default to \`variables + projects\` so the out-of-the-box key works with MCP clients

### Rotating a Key
- The one-time key reveal now includes guidance for swapping a new key into an existing MCP client setup — including the \`claude mcp remove\` step Claude Code requires before re-adding a server
- The MCP docs gained a [Rotating or updating a key](https://docs.envpilot.dev/mcp-server) section covering Claude Code, Codex, Claude Desktop, and Cursor

### Docs
- Both MCP tool tables now show the API-key resource each tool requires, and a required-scopes callout sits next to the setup instructions`,
  },

  // ============================================================
  // v1.54.0 — Slack & Discord Notifications (2026-08-02)
  // ============================================================
  {
    title: "Slack & Discord Notifications with Project-Level Routing",
    version: "v1.54.0",
    type: "feature",
    publishedAt: ts("2026-08-02T05:00:00Z"),
    content: `Envpilot can now send organization activity to the Slack and Discord channels where each team already works—without ever placing secret values in a message.

### Connect a Channel
- Connect Slack or Discord through a one-click OAuth flow and choose the destination channel during authorization
- Connect the same provider more than once when different teams or projects need separate destinations
- Manual webhook setup remains available as an advanced fallback

### Route Only What Matters
- Send activity from every project or select the exact projects assigned to a destination
- Choose event groups independently: variable changes, access requests, member activity, and security events
- Pause or resume a destination, send a test notification, update its routing, or remove it from one management view

### Secret-Safe by Design
- Notifications contain useful context such as project, environment, variable name, actor, and outcome—but never the secret value
- Provider webhook URLs are encrypted in the vault instead of being stored in plaintext
- Delivery is queued, rate-limited, retried safely, and automatically disabled after repeated permanent failures

### Production Polish
- The Integrations tab disappears completely when the feature gate is disabled and respects plan availability when enabled
- Slack and Discord use their real product marks, with clear loading, empty, success, and error states throughout setup
- Existing Pro subscribers are returned to billing with a friendly "already on Pro" notice instead of a raw checkout error
- The landing page now showcases Slack, Discord, GitHub Actions, MCP, the read-only REST API, and the engineering blog as connected Envpilot workflows`,
  },

  // ============================================================
  // VS Code extension v1.16.1 — Clipboard Guard Fix (2026-08-02)
  // ============================================================
  {
    title: "VS Code Extension: Copy Works Everywhere Again",
    version: "v1.16.1",
    type: "fix",
    publishedAt: ts("2026-08-02T16:30:00Z"),
    content: `The clipboard guard was supposed to stop secrets being copied out of managed \`.env\` files. Instead it disabled copy and cut in **every** file — TypeScript, C#, project files, anything — in every window, whether or not a project was linked. This release fixes that.

### What Was Wrong
- The guard replaced VS Code's built-in copy, cut, and copy-with-syntax-highlighting commands globally the moment the extension started
- Unprotected files were meant to be handed back to the editor's own copy command, but that hand-off ran asynchronously outside the editor's clipboard gesture and failed silently — so \`Cmd+C\` did nothing at all
- Setting \`envpilot.clipboardGuard.scope\` to \`off\` did not help, because the replacement command was still installed; disabling the whole extension was the only workaround

### What Changed
- The guard no longer registers, overrides, or shadows VS Code's built-in clipboard commands under any circumstance — outside a protected \`.env\` file the extension is not in the copy path at all
- Interception is now a \`when\`-clause keybinding tied to a context key that tracks the active editor, so it exists only while a protected file is focused
- If that context key is ever stale, the handler fails open and re-runs the real copy or cut instead of swallowing the keystroke — a broken clipboard is no longer a possible outcome
- Cursor and other VS Code forks are fixed too; the previous design left copy dead on those after the first \`.env\` file was opened

### Known Limitation
Right-click → Copy and the Edit menu inside a protected \`.env\` file are not intercepted. Covering them requires overriding built-in commands, which is exactly what caused this bug. The clipboard guard is a safeguard against accidental exposure, not a security boundary — \`.env\` files remain readable by any other tool on the machine, and real enforcement lives in role-based access control, the commit guard, and the audit log.`,
  },

  // ============================================================
  // Secret Files — files that are not strings (2026-08-03)
  // ============================================================
  {
    title: "Secret Files: Keystores, SSH Keys and Certificates",
    version: "v1.55.0",
    type: "feature",
    publishedAt: ts("2026-08-03T15:30:00Z"),
    content: `Envpilot solved half the secret problem. \`DATABASE_URL\` was covered; \`upload.jks\`, \`id_ed25519\`, \`google-services.json\` and \`AuthKey.p8\` were not — so they lived in Slack DMs, 1Password notes, and one teammate's laptop. Secret Files makes them first-class: uploaded from the dashboard, encrypted, and written to their exact path by the CLI and the VS Code extension.

The goal, in one line: \`git clone && envpilot pull\` should produce a repository that builds — not one that builds after you ask someone for the keystore.

### Encrypted in Two Places, Readable From Neither
- Each file is sealed with its own AES-256-GCM key; the ciphertext goes to file storage and the key goes to the vault, so neither store alone can reveal anything
- A fresh key and nonce are generated on every write, so the classic GCM reuse failure is unreachable rather than merely guarded against
- Tampered or truncated content fails loudly instead of producing a half-written signing key

### A Path and a Mode, Not Just Bytes
- Every file carries the destination path and POSIX mode it should land at, so nobody has to remember that a keystore belongs in \`android/app/\`
- The same path may exist in several environments as long as they do not overlap — a development and a production \`google-services.json\` coexist, and each environment pulls the right one
- Files are written atomically at \`0600\` or \`0400\`, and their paths are added to \`.gitignore\` before the file exists

### In the CLI
- \`envpilot files list | status | pull | add | get | rm\`, plus \`--files\` on \`envpilot pull\`
- \`status\` compares a local copy against the server by checksum — no decryption, no download, no audit entry
- \`pull\` refuses to overwrite a local file that differs from the server unless you pass \`--force\`, and repairs permissions that have been loosened since the last pull

### In VS Code
- Files materialise alongside \`.env\` on every sync, and carry the same protections: clipboard guard, unauthorized-edit reversion, and removal when a project is unlinked
- Contents are masked in the editor by format — JSON, YAML, TOML and PEM keep their keys, comments and structure readable while every value is hidden
- Revealing values is role-based: an organization owner or team lead can unmask for 30 seconds, and a role without the permission never sees the option

### Access and Limits
- Per-file read and write grants, mirroring shared accounts, with every upload, download, grant and revocation recorded in the audit log
- Deleted files go to the trash with the same retention window as variables and accounts, and can be restored
- Available on the free plan up to three files, unlimited on Pro`,
  },
  // ============================================================
  // Project Documentation — agent drafts, human publishes (2026-08-09)
  // ============================================================
  {
    title: "Project Documentation: Agents Draft, You Publish",
    version: "v1.56.0",
    type: "feature",
    publishedAt: ts("2026-08-09T10:00:00Z"),
    content: `Handing a finished feature to the person who has to integrate it usually means opening a throwaway agent session, pasting PR links, and asking it to reconstruct documentation from diffs — archaeology, under deadline, by a session with no context. Project Documentation makes the pages a by-product of the work instead: your coding agent writes them as it builds, you review them against the plan you wrote, and publishing is the act that makes them real.

### Agents Draft, Humans Publish
- A coding agent proposes pages over MCP with \`envpilot_create_doc\`; every one lands as a **draft**
- Drafts are invisible to your team and returned by no MCP read at all — nothing an agent wrote reaches another agent until a person publishes it
- You review against the plan the work came from, which catches implementation drift as well as prose errors
- Editing a published page returns it to draft, so changed text gets a second look before readers see it

### A Real Writing Surface
- Write, Split and Read modes, with the preview scrolling to the block your caret is in rather than guessing by ratio
- Double-click any block in Split to jump the caret to that spot in the markdown
- List continuation, Tab indent, a formatting toolbar over the native undo stack, and a heading outline you can navigate
- Pages group into modules, so an e-commerce project can keep wallet, warehouse and rider endpoints apart

### Search That Finds What a Page Says
- Full-text search across titles **and** page bodies, backed by Convex search indexes
- Drafts are filtered inside the index, so an unreviewed page can never surface in a teammate's search
- The same search is available to agents through \`envpilot_search_docs\` and \`envpilot_get_doc\`

### Documentation Never Carries Secrets
- Every write is scanned: credential shapes are rejected outright, and assignment-shaped lines are flagged for review
- Pages may name a variable such as \`API_BASE_URL\`, never its value — readers resolve values through their own access
- An API key cannot hold both the \`docs\` and \`files\` scopes, so documentation and decrypted key material never share one credential
- Text that instructs an agent to call a tool is refused, and every publish, edit and deletion is audit-logged

### Deleting and Restoring
- Deleted pages go to the project trash with the same 7-day window as variables, accounts and files
- Restoring always returns a page to draft — content that has not been reviewed since deletion does not go straight back to readers

Available on Pro.`,
  },
  // ============================================================
  // Documentation on Free, and doc roles (2026-08-09)
  // ============================================================
  {
    title: "Documentation on the Free Plan, and Roles That Govern It",
    version: "v1.57.0",
    type: "improvement",
    publishedAt: ts("2026-08-09T18:00:00Z"),
    content: `Documentation is how a project explains itself, and locking it behind Pro made the free plan worse at the one thing it exists to show. Project Documentation is now on every plan, bounded by page count rather than by a gate — and it answers to the same role system as everything else in the platform.

### Available on Every Plan
- Free organizations get **10 pages per project** and **25 pages across the organization**; Pro is unlimited
- Only active pages count — moving a page to the trash frees its slot immediately, and restoring one re-checks both caps
- The dashboard hides **New Page** and explains which cap is full before you write a page it would refuse to save
- Creation over MCP is bounded by the same numbers, so an agent cannot route around a limit the dashboard enforces

### Roles Now Govern Documentation
- Four new capabilities — draft a page, edit anyone's page, publish, and delete anyone's page — replace the blanket write access every member previously held
- Publishing is its own capability: Editors and above hold it, Developers can draft but never publish, and Viewers hold none of the four
- You can always revise your own page and trash your own draft; once a page is published, deleting it needs the delete capability no matter who wrote it
- Buttons you cannot use no longer appear, and the trash lists only pages you can actually restore
- Owners now hold every capability by construction, so a capability shipped after an organization was created can no longer leave its owner locked out`,
  },
  // ============================================================
  // Owner capabilities and documentation limit fixes (2026-08-09)
  // ============================================================
  {
    title: "Owners Hold Every Capability, By Construction",
    version: "v1.57.1",
    type: "fix",
    publishedAt: ts("2026-08-09T21:00:00Z"),
    content: `A round of fixes to the role system and to how documentation page limits are counted.

### Owners Can No Longer Fall Behind Their Own Organization
- The owner's capability set is now derived from the capability catalog rather than listed by hand, so a capability shipped in a new release reaches the owner automatically
- Owner capabilities resolve from code, not from the stored role row — an organization created before a capability existed no longer has to wait for a re-seed to use it
- Both the permission checks and the admin role matrix read the same resolved set, so what the matrix shows is what the platform enforces

### Documentation Deletion Follows Publication
- You can always revise your own page and trash your own draft
- Once a page is published it belongs to the team, so deleting it requires the delete capability no matter who wrote it — an author can no longer unilaterally remove a page their teammates already rely on

### Page Limits Cost Nothing on Unlimited Plans
- Page counts are now evaluated lazily, so an organization with unlimited pages never runs the count behind a limit that can never apply
- Counting stops at the cap instead of reading one project past it, and reports the exact number at the ceiling

### Free-Tier Availability Actually Reaches Existing Organizations
- Tier defaults only ever get inserted, never overwritten, so the move of documentation onto the free plan would not have reached organizations created earlier
- A scoped migration now applies the three documentation values to existing plans, leaving every other tier setting untouched`,
  },
  // ============================================================
  // Unified design system across every surface (2026-08-13)
  // ============================================================
  {
    title: "One Design System Across Every Surface",
    version: "v1.59.0",
    type: "improvement",
    publishedAt: ts("2026-08-13T12:00:00Z"),
    content: `The dashboard now wears the same design language as the redesigned landing page, and every colour in the product comes from one file instead of being spelled out in each component.

### The Dashboard Matches the Marketing Site
- Panels carry the landing page's chrome — a mono title bar, a fine ring, and a soft top highlight — instead of the old macOS-style window dots
- The sidebar sits on its own darker surface, so navigation reads as chrome rather than as more page
- Page titles follow one pattern everywhere: the four competing heading styles the dashboard had grown are gone
- Widget toolbars are no longer copy-pasted per widget, so the "View all" rows behave identically wherever they appear

### Colours Live in One Place
- Every surface, line, text tone and status colour is a named token — change the token and the dashboard, admin panel, blog and docs all follow
- Roughly 7,100 hard-coded colour classes across the web app, admin panel, blog, docs and the shared component library were migrated onto those tokens
- The stock colour palette has been removed from the build entirely, so a hard-coded colour is no longer something the platform can accidentally ship
- Charts, form controls, scrollbars and focus rings draw from the same tokens as everything else, rather than from their own private values

### Fixes Along the Way
- Dashboard body text was falling back to Arial instead of the intended Geist typeface wherever a component did not set a font itself
- Several confirm and primary buttons were rendering dark text on a dark fill, leaving their labels effectively invisible
- Light-mode styles left over from before the platform went dark-only have been removed; they never painted, but they made every component harder to read`,
  },

  // ============================================================
  // v1.59.2 — Direct Convex dashboard workflows (2026-08-13)
  // ============================================================
  {
    title: "Faster, Real-Time Project and Organization Workflows",
    version: "v1.59.2",
    type: "improvement",
    publishedAt: ts("2026-08-13T14:15:00Z"),
    content: `Project, organization, member, and tag workflows now use authenticated Convex queries and mutations directly instead of bouncing routine dashboard work through an extra Next.js API layer.

### What You Will Notice
- Project and organization updates arrive through the same real-time connection that powers the rest of the dashboard
- Creating, editing, moving, and managing access no longer waits on an unnecessary server round trip
- Errors are presented consistently instead of changing shape between API routes and Convex functions

### Safer Authorization
- Convex derives the acting user from the signed-in identity instead of trusting user ids sent by the browser
- Organization and project membership checks live beside the data operation they protect
- Current-user organization queries only return organizations where that user has an active membership

### Bounded Cleanup
- Tag deletion now removes variable and project references through scheduled, paginated batches instead of one unbounded transaction
- Large legacy organizations receive an explicit overflow state while cleanup continues, avoiding an expensive full-table read
- The work is split into small resumable units to keep Convex execution and database costs predictable`,
  },

  // ============================================================
  // v1.59.4 — Durable project cascade deletion (2026-08-13)
  // ============================================================
  {
    title: "Project Deletion Now Finishes the Whole Job",
    version: "v1.59.4",
    type: "fix",
    publishedAt: ts("2026-08-13T15:15:00Z"),
    content: `Deleting a project now hides access immediately and queues a durable, permanent cleanup of the data and external secrets owned by that project.

### A Clearer Delete Flow
- Only the organization owner can delete a project
- The confirmation panel lists what will be removed and requires the exact project name
- The destructive action stays disabled until the name matches, then shows a disabled loading state while deletion is secured
- Deleted and inaccessible project URLs show a clean "Project not found" state instead of rendering stale settings or crashing

### Complete Project Cleanup
- Environment variables, version history, permissions, shared accounts, secret files, requests, secret shares, documentation, favorites, member assignments, and access records are removed
- Vault objects and stored file blobs are deleted before their database rows, preventing unreachable external data
- Project scopes are removed from API keys, webhooks, and invitations; credentials or destinations with no remaining scope are revoked or disabled
- The project settings row is removed only after every cleanup stage completes; security audit history remains available

### Designed for Large Projects and Predictable Convex Cost
- External deletions run in batches of 8 and database cleanup in batches of 64
- A lease and watchdog recover interrupted work, while failed provider calls retry with bounded exponential backoff
- Project reads exclude the project as soon as deletion starts, so users lose access immediately without forcing the entire cascade into one expensive request`,
  },
];
