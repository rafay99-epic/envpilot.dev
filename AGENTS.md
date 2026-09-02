# AGENTS.md

This file provides guidance to coding agents working in this repository. It is the single source of truth; `CLAUDE.md` is a symlink to it.

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
because every run exhausted the Convex free-tier Database I/O quota, and the
`e2e` job in ci.yml is deliberately skipped). Consequences:

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

#### Numeric limits: count lazily, count ACTIVE rows (CRITICAL)

Two mistakes recur in count-based limits, both silent:

1. **Use `checkCountedLimit`, not `checkNumericLimit`, on request paths.** It
   takes a `countFn(limit)` closure and short-circuits when the tier resolves
   to `null`, so an unlimited org never pays for the scan. `checkNumericLimit`
   takes an already-evaluated number — every Pro request runs the full count
   for a limit that will never bind. Reactive queries make this per-keystroke.
2. **Count through a `by_*_deleted` index with `deletedAt: undefined`.** Never
   `.take()` over `by_project` and filter in memory: trashed rows sort at the
   FRONT of that range, so a project with three deleted rows and three live
   ones reports zero against a limit of three. `countActiveFiles` in
   `gates.ts` is the reference shape — bound each project's read with
   `take(limit - count + 1)` and `break` once `count >= limit`.

Enforce the limit on **every** path that occupies a slot: create, restore
from trash, and the MCP/API create surface. An agent must never be able to
route around a cap the dashboard enforces.

#### Flipping an existing tier value needs a resync migration

`seed-tier-features` **only inserts** — it skips any `tierFeatures` row that
already exists, so admin edits survive. That means changing a value in
`TIER_CONFIGS` (e.g. free-tier availability from `"false"` to `"true"`) is a
**no-op for every deployment that has already been seeded**. Ship a
force-setting migration scoped to the changed keys alongside the flip (see
`resync-doc-tier-features`), and run it once from the admin panel after the
deploy. Do NOT add a force-setting migration to the deploy loop in
`deploy-convex.yml` — it would clobber deliberate admin edits on every
release.

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
  to main. The `deploy-action.yml` workflow publishes to the public repo,
  tags the exact version (`vX.Y.Z`), and force-moves the floating major tag
  (`v1`) — the GitHub convention that gives `@v1` pinners non-breaking updates.
- **Ordering is STRICT — backend first**: when convex/ changed in the same
  merge, `publish-action` requires `deploy-convex` (same rule as
  CLI/extension: never ship a client before the backend contract it calls).
- **Secret**: publishing needs `ACTION_PUBLISH_TOKEN` in Envpilot — a
  fine-grained PAT with Contents read/write on the public repo ONLY. The
  workflow uses the `ENVPILOT_PROD_TOKEN` bootstrap secret from the
  `Production` GitHub Environment and fails loudly if the publish token is
  missing from the pulled environment.
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
- **JetBrains plugin** (`apps/jetbrains-plugin/`): Gradle project — bump `pluginVersion` in `gradle.properties`, NOT a package.json. The bump IS the release trigger: `deploy-jetbrains` asks the Marketplace what it already has and skips the publish when the local version is not ahead, so an unrelated push touching `apps/jetbrains-plugin/**` (a README edit) no longer fails the deploy and blocks the GitHub Release. Keep `APP_VERSIONS.jetbrains` in `apps/web/src/lib/versions.ts` in sync once the version is live on the Marketplace — the plugin polls `/api/version`, so a stale `latest` silences every update notice.
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

### CI/CD — GitHub Actions (CRITICAL)

ALL CI/CD runs on GitHub Actions. `.github/workflows/ci.yml` is the entry
point (push to main + every PR) and calls the `deploy-*.yml` workflows via
`workflow_call`. CircleCI is GONE — `.circleci/` was deleted once the repo
went public and Actions became free for it; do not re-add config there.

- **Change detection**: the `changes` job diffs the push and emits a
  `run_<surface>` output per surface (convex, web, blog, docs, admin, cli,
  extension, action). Every downstream job is `if:`-gated on those outputs,
  so only relevant work runs and `needs:` chains stop everything downstream
  of a failure.
- **Quality gate first, every run**: the `checks` job (format, lint,
  typecheck, build, test) plus a `gitleaks` secret scan. `checks-passed`
  aggregates them and every deploy needs it. Red = nothing ships.
- **Secret scan**: `gitleaks dir . --config .gitleaks.toml` runs on every PR.
  Known example/placeholder strings are allowlisted in `.gitleaks.toml` —
  add a path or regex there (with a comment saying why it is not a secret)
  rather than deleting a legitimate test fixture.
- **CLI and extension ALWAYS build directly** (`bun run build`, never turbo —
  turbo once dropped build-time env vars and shipped a broken CLI). Publishes
  verify `WORKOS_CLIENT_ID` + `NEXT_PUBLIC_CONVEX_URL` are embedded in the
  artifact before shipping.
- **Deploys are main-only** (each is `if:`-gated on the branch):
  deploy-convex(+seeds) first → cli/extension/action → homebrew → Vercel
  (web, admin, blog, docs) → GitHub release.
- **Vercel git integration is fully OFF** (previews included) in all four
  apps' `vercel.json` — prod deploys go ONLY through the `deploy-vercel.yml`
  workflow (builds still run on Vercel's infra).
- **The E2E gate is disabled** — the `e2e` job is skipped, and every
  downstream `needs.e2e.result` condition accepts `skipped` OR `success`.
  The local Playwright run is the gate of record (see the testing policy).
- **Manual control**: `workflow_dispatch` on `ci.yml`, or on an individual
  `deploy-*.yml` to retry one surface. Dispatch `envpilot-smoke.yml` with
  `development` or `production` to validate that Environment's bootstrap key
  and required variables without checking out code or running any build or
  deployment.
- **Adding a surface**: one path rule in the `changes` job, one output, one
  `if:`-gated job block.
- **Deployment variables come from Envpilot**: deployment jobs call the
  published `rafay99-epic/envpilot-action@v1` through
  `.github/actions/load-env`. GitHub Environment secrets are the bootstrap:
  `Production` holds `ENVPILOT_PROD_TOKEN`, while `development` holds
  `ENVPILOT_DEV_TOKEN`. Main jobs pull Envpilot's production environment;
  same-repository PR jobs pull development. Fork PRs receive neither secret
  and compile with the literal CI stubs. GitHub's generated `GITHUB_TOKEN`
  remains built in. Keep production credentials, publish tokens, service
  identifiers, and Sentry DSNs in Envpilot rather than duplicating them in
  GitHub.
- **PR scope labels**: `.github/workflows/pr-labeler.yml` uses the official
  `actions/labeler` action with `.github/labeler.yml`. It runs as
  `pull_request_target` without checking out or executing PR code, so fork PRs
  can be labeled safely. Keep its path taxonomy in sync when adding a surface.

## Architecture

Envpilot is a secure environment variable management platform with four client surfaces: a **Next.js web app**, a **CLI tool**, a **VS Code extension**, and a **JetBrains IDE plugin**, managed as a **bun workspaces + Turborepo** monorepo.

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
  - The legacy root `<module>.ts` client-compat shims are GONE (deleted when
    `minCli`/`minExtension` reached the features/_-native builds 1.18.0 /
    1.15.0). Never register functions at the convex root; all code uses the
    real `api.features._` paths.
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

### Roles & Permissions — the capability registry (CRITICAL)

Authorization is a **capability registry**, not a role enum. Never compare
role slugs in feature code; resolve the profile and ask it.

- **Catalog**: `convex/lib/capabilities.ts` — `CAPABILITIES` is the complete
  vocabulary. Every key corresponds to enforcement that exists in code, so
  adding one is a code change (review, test, deploy).
- **Profiles**: `convex/lib/roleProfiles.ts` — `SYSTEM_PROFILES` (owner,
  project_manager, team_lead, developer) and `SEEDED_CUSTOM_PROFILES`
  (editor, viewer). Seeded into `roleRegistry` by `seed-role-registry`.
- **Resolve + check**: `getRoleProfile(ctx, role)` then
  `hasCapability(profile, "key")` (both re-exported from `convex/lib/authz.ts`).
- **Roles are data, capabilities are code.** A new ROLE is a registry row. A
  new CAPABILITY is a code change plus a seed run.

**Every gatable resource gets its own capabilities.** Variables, accounts,
files and docs each carry `project.<resource>.create|update|delete` (docs also
`publish`). A feature that reuses another resource's capability — or grants
blanket write to every member — has bypassed the role system, which is a
review-blocking defect. Wire the frontend to the same flags the backend
checks so a user never sees a button whose mutation will refuse them.

**The owner holds every capability, by construction.** `ALL_CAPABILITY_KEYS`
is DERIVED from `CAPABILITY_KEYS` (minus `access.*` scope modifiers and
`project.requests.submit`) — never hand-list it, or a newly shipped capability
silently locks the owner out of their own organization. `resolveCapabilities`
returns code truth for the owner slug regardless of what the stored
`roleRegistry` row says, so a deploy that lands before its seed cannot leave
the owner short a key. Both are pinned by `role-parity.test.ts`.

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

## Comments

When adding comments make sure the comments are too the point and logicall and not all over the codebase you don't need to esplain all the codebase as well. Just one comment to reference something or which is very important then don't add useless comments to the codebase.

## Feature Gate

Any new feature that is added into the web application should be a part of the cli, vs code extension, github action mcp server, docker image, jetbrain plugin as well.

Make sure the logic should be on the BE side, that is convex, there is convex dertivate for all the platform so please use that for any kind of connection and if not sure about use the skills for searching, skills such as cavaman skills, ponly tail searhing and review skills as well.

these skills are defined and already as set as global so please load them and use them please

Docs need to be upto date as well, new feature new cli or any new changes or any new commands the docs project need to be updated as well.
