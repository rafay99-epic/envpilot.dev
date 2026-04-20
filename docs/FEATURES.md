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

## Billing & Payments (Polar.sh)

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
- Webhook endpoints (Polar.sh)
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
- **Polar.sh** — Subscriptions, checkout, customer portal, webhooks
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

## 🔧 Finish What’s Already Half-Built (Quick Wins)

These are the lowest-effort, highest-impact items because the schema already exists:

- **Template marketplace**
  - Tables: `environmentTemplates` + `templateVariables` already exist.
  - Ship a “Next.js + Stripe + Supabase” template picker during project creation.
  - Add community-submitted templates + voting.

- **SSO implementation**
  - `workosOrgId` exists in schema.
  - Wire WorkOS AuthKit org SSO into a Pro flow.

- **Feature request voting UI**
  - `featureVotes` table exists.
  - `/wishlist` page exists, but voting isn’t exposed.

- **Custom branding**
  - Registry flag exists, but no UI.
  - Let Pro users set **logo + primary color** on:
    - shared secret links
    - invitation emails

- **Keyboard shortcut customizer**
  - Flag is already enabled.
  - Build the UI.

---

## 🚀 Enhance Existing Features

### Variables & Secrets

- **Drift detection**
  - Compare `.env` file on disk vs. remote state in CLI/extension.
  - Show a **“drift” badge** in the tree view.

- **Variable references / interpolation**
  - Example: `DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@...`
  - Huge DX win.

- **Secret references to other secrets**
  - Example: `{{ prod.STRIPE_KEY }}`
  - Let staging inherit from prod with override.

- **“Why did this change?” annotations**
  - Optional **reason field** on every variable edit.
  - Surface it in version history.

- **Variable deprecation warnings**
  - Mark a var as deprecated with a sunset date.
  - CLI/extension warns before removal.

- **Environment comparison view**
  - Side-by-side diff of dev vs. staging vs. prod.
  - Include “copy to other env” button.

### Audit & Security

- **Anomaly detection**
  - Flag unusual access patterns:
    - user pulling all prod secrets for first time
    - off-hours access
    - new IP
  - Send email alerts.

- **Breach response workflow**
  - One-click: “rotate all secrets in this project”
  - Automated coordinator for connected services.

- **Secret health score per project**
  - Rotated recently?
  - Shared externally?
  - Expired permissions?
  - Overall score.

- **Just-in-time access requests**
  - Member requests temporary prod access → admin approves for N hours → auto-revoked.

### CLI / Extension

- **`envpilot run`**
  - Example: `envpilot run -- bun dev`
  - Inject secrets into child process without writing a `.env` file.
  - Standard Doppler pattern.

- **`envpilot exec`**
  - Example: `envpilot exec --env prod npm test`
  - Namespaced by environment for CI scripts.

- **Shell completions**
  - `bash` / `zsh` / `fish` completions for:
    - `envpilot switch`
    - project names
    - env names

- **Extension: variable value preview on hover**
  - When permission allows: hover over `process.env.API_KEY` to see masked value.

- **Extension: “Open in Envpilot” CodeLens**
  - Add CodeLens on `process.env.X` references.

---

## ⭐ Bold Differentiators (Stand Out)

### AI / Intelligent Features

- **AI-powered secret classifier**
  - On paste, detect “this looks like AWS key / Stripe key / JWT”
  - Auto-tag + enable rotation reminders.

- **AI `.env` onboarding**
  - User uploads messy `.env.example`
  - AI structures it into projects/environments with suggested value sources.

- **Natural language search**
  - Example: “Show me all Stripe keys that haven’t been rotated in 90 days.”

### Integrations (this is where Doppler / Infisical win)

- **Sync destinations**
  - Push variables to:
    - Vercel, Netlify, Cloudflare, Railway, Render, Fly.io
    - AWS Secrets Manager / Parameter Store
    - GCP Secret Manager
    - Azure Key Vault
    - Kubernetes secrets (operator)
    - GitHub Actions secrets (your deferred `packages/github-action/` plan)
    - CircleCI, GitLab CI
  - One-way sync with webhook retry.

- **GitHub App**
  - Auto-comment on PRs:
    - “This PR adds `STRIPE_KEY` to code — no matching variable in Envpilot for staging.”

- **PR preview environment**
  - Auto-provision a scoped env for every preview deployment.
  - Auto-teardown on merge.

- **Terraform / Pulumi provider**
  - Manage Envpilot projects as IaC.

- **SDKs**
  - Official SDKs:
    - `@envpilot/node`
    - `@envpilot/python`
    - `@envpilot/go`
    - `@envpilot/rust`
  - Fetch + cache + auto-refresh without a `.env` file.

### Compliance & Enterprise

- **SOC 2 / HIPAA / GDPR mode**
  - Toggleable compliance profile enforcing:
    - audit retention
    - MFA
    - IP allowlists
    - data residency

- **IP allowlisting**
  - Per org / per token.

- **Service accounts with scoped tokens**
  - Separate from user auth.
  - Per-service, per-env, revocable.

- **Break-glass access**
  - Emergency access with:
    - automatic Slack alert
    - mandatory post-mortem form

- **Data residency**
  - Let orgs choose EU / US Convex region.

### Collaboration

- **Slack / Discord / Teams notifications**
  - Per-project channels for:
    - rotations
    - access requests
    - approvals

- **Approval workflows**
  - Writes to prod require N approvals before applying (dual-control).

- **Comments on variables**
  - Context threads:
    - “why does `STRIPE_KEY` have `sk_test_` prefix in prod?”
    - “oh that’s the sandbox checkout.”

- **Shared drafts**
  - Propose a batch of variable changes, review like a PR, merge when approved.

### Developer UX

- **`.env` linting**
  - Detect:
    - hardcoded secrets in code
    - missing vars
    - unused vars
  - As a CLI command + GitHub check.

- **Local-only overrides**
  - Personal values shadow team defaults for one dev, never synced.

- **Offline mode for CLI**
  - Cached encrypted bundle; works on planes.

- **Multiple active organizations**
  - In CLI/extension context, not just one.

### Billing / Monetization

- **Usage-based add-ons**
  - Extra seats
  - extra secret shares
  - extra rotation-enabled vars
  - without jumping straight to Pro

- **Team plan tier**
  - Between Free and Pro:
    - small teams need >3 members but not all Pro features

- **Annual billing discount**
  - 2 months free

---
