# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Rules

### Development Server

- **Never start the dev server** — Convex and Next.js are always running during development. Do not run `bun run dev`, `bun run dev:web`, or `bun run dev:convex`.
- **Verify work using built-in checks only**: `bun run typecheck`, `bun run lint`, `bun run format:check`, or `bun run check:all` (runs all three).

### Feature Registry & Tier Gating (CRITICAL)

Every gatable feature in the platform is managed through the **dynamic feature registry** (`convex/featureRegistry.ts`). When implementing any new feature that should be tier-gated:

1. **Add the feature to `SEED_FEATURES`** in `convex/featureRegistry.ts` with key, displayName, valueType, category, defaultValue, resettable, sortOrder.
2. **Add tier overrides** to `seedDefaultTierFeatures` in the same file (free/pro values).
3. **Mirror the seed data** in `convex/admin.ts` → `runMigration` → `seed-feature-registry` and `seed-tier-features` handlers.
4. **Enforce on the backend** using `checkBooleanFeature(db, orgId, key)` or `checkNumericLimit(db, orgId, key, count)` from `convex/featureRegistry.ts` in the relevant mutation/query.
5. **Enforce on the frontend** by wrapping UI with `<FeatureGate organizationId={orgId} featureKey="key_name" featureName="Display Name">`.
6. **For API routes** (CLI/extension), use `api.featureRegistry.checkFeature` query via ConvexHttpClient.

The seed functions use an **upsert pattern** — running them multiple times is safe. Existing features get updated if properties changed, new features get inserted, nothing duplicates.

All enforcement is automatically **bypassed when the Tier Enforcement admin toggle is OFF** (pre-alpha mode). The resolver returns `true` for booleans and `null` (unlimited) for numerics when enforcement is disabled.

#### Dual-Gate Pattern: Boolean + Usage Limit

When a feature incurs **compute or infrastructure cost** (crons, emails, external API calls), it must have **two** registry entries:

1. **Boolean gate** (`feature_name`, type `boolean`) — controls whether the feature is available at all.
2. **Numeric limit** (`feature_name_limit`, type `numeric`) — caps how many resources can use the feature. Use `"null"` for unlimited (pro), a number string for capped (free).

**When to add a usage limit** — ask: does this feature run recurring background work per resource (crons, scheduled jobs, outbound emails)? If yes, it needs a limit. Examples:

| Feature                       | Needs limit?                      | Why                                                             |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `secret_rotation`             | **Yes** → `secret_rotation_limit` | Hourly cron scans every rotation-enabled variable, sends emails |
| `variable_version_history`    | No                                | Passive data — stored on write, no background cost              |
| `bulk_import` / `bulk_delete` | No                                | One-time user-initiated action, no recurring cost               |
| `sso_enabled`                 | No                                | Auth delegation — cost is per-login, not per-resource           |
| `audit_log_retention_days`    | No                                | Already capped by the numeric value itself (days)               |
| `custom_branding`             | No                                | Static config, no compute                                       |

**Enforcement pattern** (backend):

```typescript
// 1. Check boolean gate first
const gate = await checkBooleanFeature(db, orgId, "secret_rotation");
if (!gate.allowed) throw new Error("...");

// 2. Then check numeric limit
const count = await countRotationEnabledVariables(db, orgId);
const limit = await checkNumericLimit(
  db,
  orgId,
  "secret_rotation_limit",
  count
);
if (!limit.allowed)
  throw new Error(`Limit reached (${limit.current}/${limit.limit})`);
```

Add a `count*` helper in `convex/featureRegistry.ts` for each limited feature (e.g., `countRotationEnabledVariables`).

### Versioning

Semver policy across all packages:
- **Minor bump** (1.X.0): Every new feature added to the package
- **Patch bump** (1.0.X): Optimizations, bug fixes, patches
- **Major bump** (X.0.0): Major rewrites or major UI overhauls (reserved, not used lightly)

Package versions to bump when making changes:
- **Web app** (`apps/web/`): bump `apps/web/package.json`
- **Admin panel** (`apps/admin/`): bump `apps/admin/package.json`
- **CLI** (`apps/cli/`): bump `apps/cli/package.json`
- **VS Code extension** (`apps/vscode-extension/`): bump `apps/vscode-extension/package.json`
- **Root monorepo** (`package.json`): bump when features span multiple packages

## Commands

```bash
# Development (runs Next.js + Convex in parallel)
bun run dev

# Run individual apps
bun run dev:web                                    # Next.js only
bun run dev:convex                                 # Convex only
bun run dev:cli                                    # CLI watch mode
bun run dev:extension                              # Extension watch mode

# Build
bun run build                                      # build all apps
bun run build:web                                  # web app only
bun run build:cli                                  # CLI only
bun run build:extension                            # extension only

# Lint & typecheck
bun run lint                                       # lint all
bun run typecheck                                  # typecheck all
bun run format:check                               # prettier check
bun run format:fix                                 # prettier fix
bun run check:all                                  # full CI check

# E2E tests (Playwright, Chromium only, auto-starts dev server)
bun run test:e2e
cd apps/web && bunx playwright test tests/e2e/specific.spec.ts

# CLI tests
bun run test:cli

# Convex
bun run convex:deploy                              # deploy functions to production
bun run dev:convex                                 # sync functions during development
```

## Architecture

Envpilot is a secure environment variable management platform with three client surfaces: a **Next.js web app**, a **CLI tool**, and a **VS Code extension**, managed as a **bun workspaces + Turborepo** monorepo.

### Data Flow

```
Browser/CLI/Extension → Next.js API Routes → Convex (database) + WorkOS Vault (encrypted secrets)
                              ↓
                    WorkOS AuthKit (auth) + Stripe (billing) + Resend (email)
```

- **Convex** is the real-time database. Functions in `convex/` are auto-deployed during `bun run dev`. React components consume data via `useQuery`/`useMutation` from `convex/react` with the auto-generated `api` object.
- **WorkOS Vault** stores actual secret values. Convex only stores vault reference IDs, never plaintext secrets. See `apps/web/src/lib/vault.ts`.
- **WorkOS AuthKit** handles authentication. Middleware in `apps/web/src/proxy.ts` protects all routes except those in `unauthenticatedPaths`.

### Key Directories

- `convex/` — Backend functions (queries, mutations) and `schema.ts` (database schema). Auto-generates types in `convex/_generated/`. Has its own independent tsconfig. **Must stay at the monorepo root** (Convex CLI requirement).
- `apps/web/` — Next.js web app (`@envpilot/web`).
  - `apps/web/src/app/api/` — REST API routes. Use `withAuth()` middleware for auth. Use `ConvexHttpClient` for server-side Convex calls.
  - `apps/web/src/hooks/` — Custom React hooks wrapping Convex queries.
  - `apps/web/src/lib/` — Shared utilities: auth, vault, stripe, email, tier-limits, feature-flags.
- `apps/cli/` — CLI npm package (`@envpilot/cli`). Uses Commander.js, builds with tsup, tests with vitest.
- `apps/vscode-extension/` — VS Code extension package. OAuth-based auth, real-time sync, esbuild bundled.
- `packages/` — Shared config packages (tsconfig, eslint-config, prettier-config).

### Roles & Permissions

Three-tier RBAC defined in `apps/web/src/lib/auth.ts`:

- **Admin** — Full access including variable rollback and permission management
- **Team Lead** — Manage projects/variables, grant/revoke per-variable access
- **Member** — Read-only projects; variable access requires explicit per-variable permissions

### Important Conventions

- **Package manager**: bun (workspaces), with Turborepo for task orchestration
- **Path aliases**: `@/*` maps to `./src/*` in the web app; `@convex/*` maps to `../../convex/*`
- React Compiler is enabled (Next.js `reactCompiler: true`) — avoid manual `useMemo`/`useCallback`
- Zod v4 for input validation in API routes and CLI
- Convex validators (`v.*`) for backend function args, separate from Zod
- Tailwind CSS v4 via PostCSS
- ESLint v9 flat config across all packages
- TypeScript configs extend shared bases from `@envpilot/tsconfig`
- Convex tsconfig is independent (required by Convex runtime)

### Environment Variables

All env vars live in `.env.local` at the **monorepo root**. The web app reads it via symlink (`apps/web/.env.local → ../../.env.local`). Run `bun run setup` to create both. See `.env.example` for the full template.

Required: `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_APP_URL`, `WORKOS_REDIRECT_URI`.
Optional: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `NEXT_PUBLIC_PAYMENTS_ENABLED`, `RESEND_API_KEY`, `FROM_EMAIL`.
