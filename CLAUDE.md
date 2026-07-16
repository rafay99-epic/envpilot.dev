# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Rules

### No AI Attribution (CRITICAL)

Never add AI-contribution markers to anything in this repository: no
`Co-Authored-By: Claude ...` (or any AI/bot) trailers in commit messages, no
"Generated with Claude Code" footers in PR titles/descriptions, no AI credits
in code comments, changelogs, or docs. Commits and PRs carry the repository
owner's authorship only. This overrides any default attribution behavior.

### Skills

There are some important skills defined in the .claude file or .agent folders . Use them to enhance your work and make sure that the code you write is up to quality standard.

### Branching

ALL work happens on branches: switch to main, pull, branch from main, do the
work, open a PR. Automated reviewers (e.g. CodeRabbit) review it; after their
pass, do your own code review and verify the change is production ready. No
sloppy generated code. Every change ships through a PR because the developer
reviews and verifies it personally before merge.

### Development Server

- **Never start the dev server** — Convex and Next.js are always running during development. Do not run `bun run dev`, `bun run dev:web`, or `bun run dev:convex`.
- **Verify work using built-in checks only**: `bun run typecheck`, `bun run lint`, `bun run format:check`, or `bun run check:all` (runs all three).

### CLI local testing — MUST be isolated from the production CLI (CRITICAL)

The developer has the **production `@envpilot/cli` installed globally** and uses it for real projects. The CLI stores accounts/tokens in a global config `conf` locates via `$HOME` (`~/Library/Preferences/envpilot-nodejs/config.json` on macOS).

- **NEVER `bun link` / `npm link` the CLI** — it shadows the production `envpilot` on `$PATH` everywhere.
- **NEVER run a dev/branch build against the real global config.** A dev build that hits the production login will try to WorkOS-refresh the old `env_` token, fail, and **wipe the stored account** (this happened once — restore from `~/Library/Preferences/envpilot-nodejs/config.json.pre-multiaccount.bak`).
- **NEVER change the global `apiUrl`** (production is `https://www.envpilot.dev`).
- **ALWAYS test via the isolated runner** `apps/cli/scripts/cli-dev.sh`, which sets a throwaway `$HOME` (`/tmp/envpilot-dev-home`, override `ENVPILOT_DEV_HOME`) and a scratch workdir so the dev build cannot see or touch the production config. It talks to the DEV Convex deployment (baked at build time) and the local dev server for vault routes (`apiUrl=http://localhost:3000`, set inside the sandbox).
  - Build: `cd apps/cli && WORKOS_CLIENT_ID=<dev client id> NEXT_PUBLIC_CONVEX_URL=<dev convex url> bun run build`
  - Run: `apps/cli/scripts/cli-dev.sh <command>` (e.g. `login`, `whoami`, `list orgs`).
  - Reset the sandbox: `rm -rf /tmp/envpilot-dev-home`.
- The device-flow `login` requires a **human browser approval** (WorkOS-hosted device page) — it cannot be fully automated. Use a throwaway/dev WorkOS account, never the production login.

### Testing Policy (every feature PR)

1. **Playwright end-to-end tests are mandatory for every feature.** Cover the happy path and the reachable edge cases by driving the REAL UI (existing components, existing flows — never test-only shortcuts). New specs go in `apps/web/tests/e2e/authenticated/` and must follow the suite's existing conventions (`support.ts` helpers, unique test-data naming, cleanup so reruns stay green, self-skip when preconditions are unavailable). Playwright reuses the already-running dev server on :3000.
2. **Smoke test before opening/finishing the PR:** the FULL e2e suite (`cd apps/web && bunx playwright test`) must pass, not just the new spec — the point is catching regressions in existing flows. All tests must pass (self-skips are acceptable); a failing existing test is a blocker, and bending a test to pass instead of fixing the product is never acceptable. **The FULL suite run is done by the developer (the human), not by Claude** — Claude writes the specs and may run its own NEW spec file in isolation to verify it, but must never launch the full suite; hand off to the developer for the suite run instead.
3. **Final testing is done by the developer** (the human) on the PR before merge — automated green is necessary but not sufficient; do not merge on the AI's say-so.

#### E2E in CI is DISABLED — the local suite is the gate of record

CI runs NO Playwright suite (it was disabled on the old GitHub Actions CI
because every run exhausted the Convex free-tier Database I/O quota, and it
was deliberately NOT ported to the CircleCI pipeline). Consequences:

- **The full local run before every merge is mandatory and is the only
  gate** — never skip it.
- Suite characteristics: fully parallel (per-worker fixture projects via
  `support.ts getWorkerProjectSlug`), e2e account is PRO-tier, a `cleanup`
  setup project purges stale `E2E_*` debris (age-gated 30 min) before runs.
  Only ONE suite run at a time — concurrent runs share port 3000.
- Planned replacement: run CI e2e against a self-hosted local Convex backend
  (`ghcr.io/get-convex/convex-backend` — zero cloud quota).

### Feature Registry & Tier Gating (CRITICAL)

Every gatable feature in the platform is managed through the **dynamic feature registry** (`convex/features/featureRegistry/`). When implementing any new feature that should be tier-gated:

1. **Add the feature to `SEED_FEATURES`** in `convex/lib/seedData.ts` (single source of truth — consumed by `runMigration`'s `seed-feature-registry` handler in `convex/features/admin/migrations.ts`; no mirroring needed) with key, displayName, valueType, category, defaultValue, resettable, sortOrder.
2. **Add tier overrides** to the `tierConfigs` map in `convex/features/admin/migrations.ts` → `seed-tier-features` handler (free/pro values).
3. **Enforce on the backend** using `checkBooleanFeature(db, orgId, key)` or `checkNumericLimit(db, orgId, key, count)` from `convex/features/featureRegistry/gates.ts` in the relevant mutation/query.
4. **Enforce on the frontend** by wrapping UI with `<FeatureGate organizationId={orgId} featureKey="key_name" featureName="Display Name">`.
5. **For API routes** (CLI/extension), use the `api.features.featureRegistry.queries.checkFeature` query via ConvexHttpClient.

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

Add a `count*` helper in `convex/features/featureRegistry/gates.ts` for each limited feature (e.g., `countRotationEnabledVariables`).

### Public API & MCP server (pro features)

One enforcement core, three faces: the REST API (`/api/v1/*`), the MCP
server (`/api/mcp`), and the GitHub Action all authenticate with `apiKeys`
(org-scoped, dynamic scope: projects all|list, environments, resources,
optional expiry; SHA-256 hash only) and route EVERY request through
`convex/features/api/authorize.ts::_authorizeRequest` — never re-implement
authorization for a new surface. Denials are returned (not thrown) so audit
writes survive; unknown/revoked/expired keys get one uniform answer; the
tier gate (`public_api` / `mcp_server` per surface) re-checks on every
request. Read paths live in `convex/features/api/reads.ts` (bounded
active-only reads, refuse-partial >1000, loud decrypt aborts — never
partial data or sentinel values). Keys are managed in Organization →
Settings → API Keys (org-wide creation is owner-only). Legacy
`serviceTokens` (CI/CD tab) still work via a compat fallback in
`cicd/pull.ts`; `migrate-service-tokens` copies them into `apiKeys`.
Docs are MDX files in `apps/web/content/docs/` (never Convex-stored).

### GitHub Action release flow (public repo from a private monorepo)

Consumers use `uses: rafay99-epic/envpilot-action@v1`, which resolves against
the PUBLIC repo `rafay99-epic/envpilot-action` — the monorepo stays private.
Only the built surface is ever published: `action.yml`, `dist/index.js`
(committed, esbuild bundle), `README.md`, `LICENSE`. Never monorepo source.

- **Releasing**: bump `packages/github-action/package.json` version and merge
  to main. The CircleCI `publish-action` job publishes to the public repo,
  tags the exact version (`vX.Y.Z`), and force-moves the floating major tag
  (`v1`) — the GitHub convention that gives `@v1` pinners non-breaking updates.
- **Ordering is STRICT — backend first**: when convex/ changed in the same
  merge, `publish-action` requires `deploy-convex` (same rule as
  CLI/extension: never ship a client before the backend contract it calls).
- **Secret**: publishing needs the `ACTION_PUBLISH_TOKEN` CircleCI project
  env var — a fine-grained PAT with Contents read/write on the public repo
  ONLY. The job fails loudly with instructions if it is missing.
- **Backend counterpart**: CI/CD service tokens (`convex/features/cicd/`) —
  read-only, SHA-256-hash-stored, project+environment scoped, pro-gated
  (`cicd_service_tokens`), managed in Project → Settings → CI/CD Tokens.
  Every pull/denial is audit-logged; pulls fail LOUDLY (never partial data,
  never sentinel values). Prod feature-registry seeding is automatic after
  every convex deploy (the CircleCI `deploy-convex` job runs the seed migrations).

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
- **Blog / Docs apps** (`apps/blog/`, `apps/docs/`): bump their package.json —
  NOT in `versions.ts`/`APP_VERSIONS` (static sites, not polling clients).
- **GitHub Action** (`packages/github-action/`): bump `packages/github-action/package.json` — the bump IS the release trigger (deploy-action publishes it, tags `vX.Y.Z`, and moves the floating `v1` so `@v1` consumers always get the latest). Does NOT go in `versions.ts`/`APP_VERSIONS` — the action is tag-pinned, not a polling client.
- **Root monorepo** (`package.json`): bump when features span multiple packages

#### Release manifest — `package.json` is NOT the only file (CRITICAL)

Bumping `package.json` alone is **incomplete**. The platform serves a release
manifest at `GET /api/version` (source: **`apps/web/src/lib/versions.ts` →
`APP_VERSIONS`**) that the CLI and extension poll to decide update notices and
**hard-blocks**. When you change a version you MUST also update this manifest,
or clients get wrong/stale enforcement.

For every release, in `apps/web/src/lib/versions.ts`:

1. **Set the `latest` value** to the new package version:
   - CLI bump → set `APP_VERSIONS.cli` to `apps/cli/package.json` version.
   - Extension bump → set `APP_VERSIONS.extension` to the extension's version.
   - Web bump → set `APP_VERSIONS.web` to `apps/web/package.json` version.
     These must **match** the corresponding `package.json` exactly (behind → no
     update notice fires; ahead → clients think they're outdated).

2. **Bump `minCli` / `minExtension` ONLY on a breaking release** — i.e. when the
   new server/Convex contract makes older clients genuinely stop working (like
   the Stage 2 auth cutover). This hard-blocks everything below it with an
   upgrade prompt. Leave it untouched for ordinary feature/patch releases.

   ⚠️ **NEVER set `minCli`/`minExtension` higher than a version that is actually
   published and installable.** Setting a minimum above the latest published
   build locks out **every** user with no valid upgrade target — a total
   lockout. Rule: `min ≤ latest`, and `latest` must already be (or be
   simultaneously) published. The Playwright spec
   `apps/web/tests/e2e/version-endpoint.spec.ts` asserts `min ≤ latest` as a
   backstop, but it cannot verify "actually published" — that's on you.

**Enforcement wiring** (don't move without updating both ends): `/api/version`
must stay in `unauthenticatedPaths` (`apps/web/src/proxy.ts`) or signed-out
clients get an HTML redirect instead of JSON. CLI enforces in
`apps/cli/src/lib/program.ts` (`preAction` → `enforceVersion()`); the extension
enforces in `wrapCommand` (`apps/vscode-extension/src/extension.ts`) via
`isExtensionOutdated()`. Both **fail open** on network errors — a flaky network
never bricks a client.

## Commands

```bash
# Development (runs Next.js + Convex + Admin in parallel)
bun run dev

# Run individual apps
bun run dev:admin                                  # Admin dashboard only
bun run dev:blog                                   # Blog app (port 3001)
bun run dev:docs                                   # Docs app (port 3002)
bun run dev:cli                                    # CLI watch mode
bun run dev:extension                              # Extension watch mode

# Build
bun run build                                      # build all apps
bun run build:web                                  # web app only
bun run build:cli                                  # CLI only
bun run build:admin                                # admin dashboard only
bun run build:extension                            # extension + package VSIX

# Lint & typecheck
bun run lint                                       # lint all
bun run typecheck                                  # typecheck all
bunx prettier --check .                            # prettier check (no standalone script)
bun run format:fix                                 # prettier fix
bun run check:all                                  # full CI check

# E2E tests (Playwright, Chromium only, auto-starts dev server)
bun run test:e2e
cd apps/web && bunx playwright test tests/e2e/specific.spec.ts

# CLI tests
bun run test:cli

# Convex
bunx convex deploy                                 # manual prod deploy (normally via CI on merge)
```

### CI/CD — CircleCI "pipeline v2" (CRITICAL)

ALL CI/CD runs on CircleCI (`.circleci/config.yml` + `.circleci/jobs.yml`).
GitHub Actions is DORMANT: every `.github/workflows/*.yml` is kept for
reference but triggers only on `workflow_dispatch` — nothing runs there.

- **Dynamic config**: a ~15s `detect` setup job diffs the push, maps changed
  paths to surfaces (convex, web, blog, docs, admin, cli, extension, action;
  `packages/ui` fans out to web+blog+docs; root manifests and `.circleci/`
  fan out to everything), ORs in manual force parameters, and GENERATES the
  continuation workflow — only relevant jobs exist, with `requires` chains
  computed so any failure blocks everything downstream.
- **Quality gate first, every pipeline**: prettier + lint + typecheck (Next
  route types via `next typegen`, no builds) + convex typecheck. Red = nothing
  else runs.
- **CLI and extension ALWAYS build directly** (`bun run build`, never turbo —
  turbo once dropped build-time env vars and shipped a broken CLI). Publishes
  verify `WORKOS_CLIENT_ID` + `NEXT_PUBLIC_CONVEX_URL` are embedded in the
  artifact before shipping.
- **Deploys exist ONLY on main pipelines** (the generator never emits them
  for branches): deploy-convex(+seeds) first → publish-cli/extension/action →
  deploy-homebrew → CI-gated Vercel deploys → GitHub release.
- **Vercel git integration is fully OFF** (previews included) in all four
  apps' `vercel.json` — prod web/blog/docs/admin deploy ONLY via the CircleCI
  `vercel deploy --prod` jobs (builds run on Vercel's infra).
- **Manual control**: CircleCI "Trigger Pipeline" (UI or API) with parameters
  `force-<surface>: true` or `run-everything: true`. Forcing on a branch runs
  builds only — deploys still never leave main.
- **Adding a surface** (e.g. a future Android app): one path rule in detect,
  one force parameter, one jobs block — recipe in the config.yml header.
- Config changes: ALWAYS `circleci config validate` locally before pushing.

## Architecture

Envpilot is a secure environment variable management platform with three client surfaces: a **Next.js web app**, a **CLI tool**, and a **VS Code extension**, managed as a **bun workspaces + Turborepo** monorepo.

### Data Flow

```
Browser/CLI/Extension → Next.js API Routes → Convex (database) + WorkOS Vault (encrypted secrets)
                              ↓
                    WorkOS AuthKit (auth) + Polar.sh (billing) + Resend (email)
```

- **Convex** is the real-time database. Functions in `convex/` are auto-deployed during `bun run dev`. React components consume data via `useQuery`/`useMutation` from `convex/react` with the auto-generated `api` object.
- **WorkOS Vault** stores actual secret values. Convex only stores vault reference IDs, never plaintext secrets. See `apps/web/src/lib/vault.ts`.
- **WorkOS AuthKit** handles authentication. Middleware in `apps/web/src/proxy.ts` protects all routes except those in `unauthenticatedPaths`.

### Key Directories

- `convex/` — Backend functions (queries, mutations) and `schema.ts` (database schema). Auto-generates types in `convex/_generated/`. Has its own independent tsconfig. **Must stay at the monorepo root** (Convex CLI requirement).
  - `convex/features/<feature>/` — ALL implementation code, organized by feature/sub-feature (variables, accounts, permissions, sharing, projects, organizations, users, billing, featureRegistry, admin, dashboard, audit, community, support, emails, vault, auth).
  - `convex/lib/` — shared pure helpers (identity, authz, audit, rateLimits, roleCompat, seedData, users). No registered functions here.
  - **9 root `<module>.ts` files are legacy client compat shims** (deviceSessions, featureRegistry, organizations, projectMembers, projects, tierLimits, variableRequests, variableValues, variables). They re-export ONLY the 16 functions that published CLI (>= 1.14.0) / extension (>= 1.7.2) builds call by baked-in string paths. Never add exports to them or import from them; all monorepo code uses the real `api.features.*` paths. Delete the shims once `minCli`/`minExtension` pass the last old-path release (see convex/README.md).
  - `schema.ts`, `crons.ts`, `auth.config.ts`, `convex.config.ts` stay at the convex root (Convex requirements).
- `apps/web/` — Next.js web app (`@envpilot/web`) — marketing site + authed
  dashboard + API routes. Does NOT serve /blog or /docs anymore: next.config
  301s `/blog/*`, `/docs/*`, `/feed.xml`, `/llms*.txt` to the subdomains.
  - `apps/web/src/app/api/` — REST API routes. Use `withAuth()` middleware for auth. Use `ConvexHttpClient` for server-side Convex calls.
  - `apps/web/src/hooks/` — Custom React hooks wrapping Convex queries.
  - `apps/web/src/lib/` — Shared utilities: auth, vault, polar, email, tier-limits, feature-flags.
- `apps/blog/` — standalone Next.js app for blog.envpilot.dev (dev port 3001).
  MDX posts in `apps/blog/content/`; Zod-validated frontmatter.
- `apps/docs/` — standalone Next.js app for docs.envpilot.dev (dev port 3002).
  MDX in `apps/docs/content/`; also serves `feed.xml`, `llms.txt`,
  `llms-full.txt`, and raw markdown at `/md/[slug]`.
- `apps/cli/` — CLI npm package (`@envpilot/cli`). Uses Commander.js, builds with tsup, tests with vitest.
- `apps/vscode-extension/` — VS Code extension package. OAuth-based auth, real-time sync, esbuild bundled.
- `packages/` — Shared config packages (tsconfig, eslint-config, prettier-config).
- `packages/ui/` — `@envpilot/ui`: shared marketing + docs components
  (MarketingShell/Nav/Footer take `navLinks`/`navActions`/`footerColumns`
  props — auth-aware pieces like PublicHeaderButtons stay in apps/web, which
  wraps them at `@/components/marketing`), shared keyframes/code-highlight CSS
  (`@envpilot/ui/styles.css`), `SITE_URLS`, `docsComponents`. TS source
  consumed via `transpilePackages` — no build step.
- `packages/github-action/` — the Envpilot GitHub Action (`@envpilot/github-action`, private in this repo). Pulls variables from `/api/v1/secrets` with a service token and exports them to `$GITHUB_ENV` / a dotenv file. CRITICAL INVARIANT in `src/main.ts`: `core.setSecret(value)` runs BEFORE any export so values are masked in workflow logs; keys/values are never printed. Own MIT LICENSE (public distribution) unlike the proprietary monorepo.

### Roles & Permissions

Three-tier RBAC defined in `apps/web/src/lib/auth.ts`:

- **Admin** — Full access including variable rollback and permission management
- **Team Lead** — Manage projects/variables, grant/revoke per-variable access
- **Member** — Read-only projects; variable access requires explicit per-variable permissions

### Variables: per-environment key uniqueness (CRITICAL domain rule)

The same variable key MAY exist on multiple active variables in a project as
long as their `environments` arrays are DISJOINT — `DATABASE_URL` for
[development] and `DATABASE_URL` for [production] are two variables with
independent values. Overlapping environments are rejected with a message
naming the clash. Invariant: every (key, environment) pair resolves to at
most one active variable, which keeps CLI pull/push, extension sync, and the
public API deterministic. Enforced via `findEnvironmentConflicts`
(`convex/features/variables/helpers.ts`) at EVERY write path: create,
createWithValue (pre-check BEFORE the vault write — never orphan a secret),
update (environment edits), variable-request create/approve, and restore
from trash. Never add a new variable write path without this check.

### Errors: use ConvexError for user-facing messages (CRITICAL)

Production Convex deployments REDACT plain `Error` messages to "Server
Error" — clients (and API routes doing string matching on messages) never
see the text. Any error a user should read MUST be `throw new
ConvexError("...")` (payload survives redaction);
`sanitizeConvexError` in `apps/web/src/lib/error-messages.ts` unwraps it.
This works in dev with plain Error and silently breaks in prod — the class
of bug is invisible until deployed.

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
Optional: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `NEXT_PUBLIC_PAYMENTS_ENABLED`, `RESEND_API_KEY`, `FROM_EMAIL`,
`NEXT_PUBLIC_BLOG_URL` / `NEXT_PUBLIC_DOCS_URL` (local: http://localhost:3001 / :3002;
prod defaults https://blog.envpilot.dev / https://docs.envpilot.dev are baked into `SITE_URLS`).
The blog and docs apps read the root `.env.local` via symlinks created by `bun run setup`.
