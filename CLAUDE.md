# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Rules

## Imortant Sub Agent

On my machine I have installed the a agent called command code and it's all open source model your job is to alway use these model and hardness with commmand `cmd -p -yolo` to get the basic coding done and then cluade model witl verify the work and make sure that it is up to the standart and if not up to the standard then it will tell the model to be a better job and point out untill the task is complete and good as well.

I am paying for this model too and I want them to be used as well, Claude will be the big reviwer and then absoult sole as well.

### Skills

There are some important skills defined in the .claude file or .agent folders . Use them to enhance your work and make sure that the code you write is up to quality standard.

### Branching

You will do all of your work. All of the workflow that is happening. in branches so you will always switch to main pull the changes and then whatever new work you're about to do and then you're going to make a branch of that from main and then make a PR set as review then code reviewer will come like code have code rabbit kube and then they will review your work and once they're done with the review you will you will verify the work you will do your own code or review and analysis and analysis make sure that the code is ready and production ready.

No slob pad generation code should be allowed. And you're following the development process of making always making a PR because I will review and verify that is it really working or not.

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
2. **Smoke test before opening/finishing the PR:** run the FULL e2e suite (`cd apps/web && bunx playwright test`), not just the new spec — the point is catching regressions in existing flows. All tests must pass (self-skips are acceptable); a failing existing test is a blocker, and bending a test to pass instead of fixing the product is never acceptable.
3. **Final testing is done by the developer** (the human) on the PR before merge — automated green is necessary but not sufficient; do not merge on the AI's say-so.

#### E2E in CI is PAUSED (cost) — local suite is the gate of record

The CI e2e gate in `ci.yml` is **hard-disabled** (`if: false &&` on the `e2e`
job) because every run drove a cloud Convex dev deployment and exhausted the
team's free-tier Database I/O quota. Consequences:

- **The full local run before every merge is mandatory and is the only
  gate** — nothing in CI runs Playwright. Never skip it.
- The deploy/release jobs accept `needs.e2e.result == 'skipped'` alongside
  `'success'`, so deploys flow while the gate is off; a FAILING gate still
  blocks everything if re-enabled (restore = remove `false &&`).
- Suite characteristics: fully parallel (per-worker fixture projects via
  `support.ts getWorkerProjectSlug`), e2e account is PRO-tier, a `cleanup`
  setup project purges stale `E2E_*` debris (age-gated 30 min) before runs.
  Only ONE suite run at a time — concurrent runs share port 3000.
- Planned replacement: run CI e2e against a self-hosted local Convex backend
  (`ghcr.io/get-convex/convex-backend` — zero cloud quota); research in
  `.frugal-fable/local-e2e/research.md`.

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

### GitHub Action release flow (public repo from a private monorepo)

Consumers use `uses: rafay99-epic/envpilot-action@v1`, which resolves against
the PUBLIC repo `rafay99-epic/envpilot-action` — the monorepo stays private.
Only the built surface is ever published: `action.yml`, `dist/index.js`
(committed, esbuild bundle), `README.md`, `LICENSE`. Never monorepo source.

- **Releasing**: bump `packages/github-action/package.json` version and merge
  to main. `ci.yml`'s `deploy-action` job (via `deploy-action.yml`) publishes
  to the public repo, tags the exact version (`vX.Y.Z`), and force-moves the
  floating major tag (`v1`) — the GitHub convention that gives `@v1` pinners
  non-breaking updates.
- **Ordering is STRICT — backend first**: `deploy-action` `needs`
  `deploy-convex` (same rule as CLI/extension: never ship a client before the
  backend contract it calls). A skipped deploy-convex falls through; a failed
  one blocks.
- **Secret**: publishing needs the `ACTION_PUBLISH_TOKEN` repo secret — a
  fine-grained PAT with Contents read/write on the public repo ONLY. The job
  fails loudly with instructions if it is missing.
- **Backend counterpart**: CI/CD service tokens (`convex/features/cicd/`) —
  read-only, SHA-256-hash-stored, project+environment scoped, pro-gated
  (`cicd_service_tokens`), managed in Project → Settings → CI/CD Tokens.
  Every pull/denial is audit-logged; pulls fail LOUDLY (never partial data,
  never sentinel values). Prod feature-registry seeding is automatic after
  every convex deploy (`deploy-convex.yml` runs the seed migrations).

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
bunx convex deploy                                 # deploy functions to production
```

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
- `apps/web/` — Next.js web app (`@envpilot/web`).
  - `apps/web/src/app/api/` — REST API routes. Use `withAuth()` middleware for auth. Use `ConvexHttpClient` for server-side Convex calls.
  - `apps/web/src/hooks/` — Custom React hooks wrapping Convex queries.
  - `apps/web/src/lib/` — Shared utilities: auth, vault, polar, email, tier-limits, feature-flags.
- `apps/cli/` — CLI npm package (`@envpilot/cli`). Uses Commander.js, builds with tsup, tests with vitest.
- `apps/vscode-extension/` — VS Code extension package. OAuth-based auth, real-time sync, esbuild bundled.
- `packages/` — Shared config packages (tsconfig, eslint-config, prettier-config).
- `packages/github-action/` — the Envpilot GitHub Action (`@envpilot/github-action`, private in this repo). Pulls variables from `/api/v1/secrets` with a service token and exports them to `$GITHUB_ENV` / a dotenv file. CRITICAL INVARIANT in `src/main.ts`: `core.setSecret(value)` runs BEFORE any export so values are masked in workflow logs; keys/values are never printed. Own MIT LICENSE (public distribution) unlike the proprietary monorepo.

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
Optional: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `NEXT_PUBLIC_PAYMENTS_ENABLED`, `RESEND_API_KEY`, `FROM_EMAIL`.
