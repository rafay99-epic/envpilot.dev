# Envpilot — Feature Inventory

## Authentication & Authorization

- WorkOS AuthKit OAuth-based sign-in/sign-up
- Session management with token refresh and revocation
- Organization switcher for multi-org users
- Three-tier RBAC: Admin, Team Lead, Member
- Project-level roles: Viewer, Developer, Manager
- Protected route middleware on all dashboard routes
- Permission-based conditional rendering

## Dashboard

- Home overview page with statistics
- Organization management (create, view, edit, delete, transfer ownership)
- Organization member management with role assignment
- Project management (create, view, edit, delete, move between orgs)
- Project member management with per-project roles
- Diff viewer for variable changes
- User preferences and settings
- Keyboard shortcut customization
- Email notification preferences

## Variable Management

- Create, read, update, delete environment variables
- Multi-environment support (development, staging, production)
- End-to-end encryption via WorkOS Vault (plaintext never stored in DB)
- Variable descriptions and sensitive/encrypted flag
- Version history with full change tracking
- Rollback to previous versions (admin only)
- Copy variable value to clipboard
- Export variables
- Bulk import from .env files (paste or file upload)
- Bulk delete with confirmation
- Variable request workflow (member requests, lead/admin approves or rejects)
- Request status tracking: pending, approved, rejected, canceled

## Granular Permissions

- Per-variable access control (read, write, admin)
- Grant/revoke access for specific users on specific variables
- Expiring/temporary permissions with TTL
- Bulk permission granting
- Permission revocation events for real-time sync across clients

## Audit Logs

- Comprehensive audit trail of all user actions
- Filter by action type, user, resource, severity
- Sensitive data access flagging
- Permission change history
- Export audit logs
- Compliance reports
- Configurable retention per tier

## Analytics

- Project activity chart
- Team activity chart
- Variable changes chart
- Resource breakdown chart (by project/type)
- Security insights

## Billing & Payments (Stripe)

- Checkout flow for subscription creation
- Subscription management and status tracking
- Customer portal access (invoices, payment methods)
- Webhook handling for subscription lifecycle events
- Dynamic tier system (admin-managed tier definitions)
- Tier-based feature gating
- Usage tracking against tier limits
- Upgrade prompts when approaching limits

## Tier Limits (per tier)

- Max projects per organization
- Max variables per project
- Max team members
- Max organizations per user
- Audit log retention days
- API access gating
- Extension access gating
- Granular permissions gating
- Version history gating
- Bulk import gating

## Invitations

- Invite team members via email
- Accept/decline invitations
- Invitation expiry handling
- Resend invitations
- Scheduled cleanup of expired invitations

## Environment Templates

- List, create, update, delete templates
- Template variable definitions
- Seed built-in templates

## Public Pages

- Landing page with terminal-style hero and feature showcase
- Documentation page
- Changelog with version history and release notes
- Feature wishlist/voting system (submit, vote, filter by status, categories)
- Contact form
- Support page
- Terms of service and privacy policy

## SEO & Crawling

- Sitemap generation
- robots.txt configuration
- BotID API protection

## CLI (`@envpilot/cli`)

- `login` / `logout` — Browser-based OAuth device code flow
- `init` — Initialize project configuration
- `config` — Manage CLI configuration
- `list` — List organizations, projects, variables
- `pull` — Pull cloud variables to local .env
- `push` — Push local .env to cloud
- `sync` — Bi-directional sync with auto-detection
- `switch` — Switch active organization/project
- `unlink` — Unlink device from account
- `usage` — View usage and tier limits
- Interactive org/project/environment selection prompts
- .env file parsing and generation
- Commit guard (prevent accidental secret commits)
- Auto-update version checking
- Colorized output
- Sentry error reporting

## VS Code Extension

- OAuth authentication with browser flow
- Projects tree view and variables tree view
- Link/unlink projects to workspace
- Pull/push variables
- Switch organizations, projects, environments
- Create and request variables
- Real-time sync via Convex WebSocket
- Multi-project support
- Environment switching (dev/staging/prod)
- Variable search
- .env syntax highlighting and CodeLens hints
- Git pre-commit hook integration (prevent secret commits)
- Clipboard guard (intercept secret clipboard operations)
- Status bar showing current project and auth state
- Dashboard web view panel
- Auto-sync on changes (configurable)
- Token storage via VSCode secret storage
- Extension update checking

## Admin Dashboard

- Overview statistics and analytics
- User management (list, ban, search)
- Organization management with tier assignment
- Tier definition management (create, update, delete)
- Feature request management (review, update status)
- Changelog management (create, edit, publish)
- Support ticket viewing
- Contact form message viewing
- Database browser (browse/edit rows directly)
- Admin migrations runner
- Platform-wide settings

## API Surface

- REST API routes for all entities (orgs, projects, variables, users, invitations, templates, billing, audit logs)
- Dedicated CLI API endpoints (`/api/cli/*`)
- Dedicated extension API endpoints (`/api/extension/*`)
- Webhook endpoints (Stripe)
- Auth callback endpoints (OAuth, CLI device code, extension)
- Config and version endpoints

## Security

- End-to-end encryption with WorkOS Vault (unique keys per secret)
- Three-tier RBAC + per-variable granular permissions
- API rate limiting
- BotID bot detection on select routes
- Audit logging with sensitive data access flagging
- Permission revocation events (real-time)
- Session management (expiration, refresh, revocation)
- Git commit guards (CLI + extension)
- Clipboard guards (extension)
- Organization-level cryptographic isolation
- Soft deletes (logical deletion, no data loss)

## Integrations

- **WorkOS** — AuthKit (OAuth), Vault (secret encryption)
- **Stripe** — Subscriptions, checkout, customer portal, webhooks
- **Resend** — Invitation emails, notification emails, support emails
- **Sentry** — Error tracking (CLI, extension, web)
- **Convex** — Real-time database, WebSocket sync, scheduled cron jobs

## Technical Features

- Bun workspaces + Turborepo monorepo
- React Compiler enabled (no manual useMemo/useCallback)
- Tailwind CSS v4
- Zod v4 input validation
- Convex validators for backend args
- ESLint v9 flat config
- Playwright E2E tests
- Real-time updates via Convex WebSocket
- Full version history on variables
- Dynamic (not hardcoded) tier/feature-flag system
- Keyboard shortcuts with command palette
- Pagination, search, and filtering across all list views
- Bulk operations (import, export, delete)
