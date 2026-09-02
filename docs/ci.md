# CI / CD

CI/CD runs on **GitHub Actions**. The workflows live in `.github/workflows/`,
with `ci.yml` as the entry point that fans out to per-surface build and deploy
jobs.

> **History:** the pipeline ran on CircleCI while the repo was private.
> Envpilot is open source now, so GitHub Actions minutes are free and CI moved
> back to it. `.circleci/` has been deleted.

## Triggers

`ci.yml` runs on:

- **`push` to `main`** — quality gate, per-surface builds, and deploys.
- **`pull_request`** — quality gate and builds only (no deploys).
- **`workflow_dispatch`** — manual runs.

## Quality gate first

Every run starts with a consolidated **checks** job: prettier, lint, typecheck,
build, and test via Turborepo, plus a Convex `tsc` pass and a **gitleaks**
secret scan (`.gitleaks.toml` allowlists known example strings). A single
required status check, **All checks passed**, gates everything downstream — red
means nothing else runs.

## Change detection

A `changes` job maps changed paths to **surfaces**, so only the relevant build
jobs do real work (Turborepo's own hashing makes unchanged packages replay from
cache):

| Changed path                                       | Surface(s)                  |
| -------------------------------------------------- | --------------------------- |
| `convex/`                                          | convex                      |
| `apps/web`, `apps/blog`, `apps/docs`, `apps/admin` | web / blog / docs / admin   |
| `apps/cli`, `apps/vscode-extension`                | cli / extension             |
| `apps/jetbrains-plugin`                            | jetbrains                   |
| `packages/github-action`                           | action                      |
| `packages/ui`                                      | web + blog + docs (fan-out) |
| root manifests / shared config                     | all surfaces                |

## Deploys (main only)

Deploy jobs run only on `push` to `main`, **backend first** — client publishes
and Vercel deploys that depend on the backend contract require `deploy-convex`:

```
deploy-convex
  ├─ seeds after every deploy (idempotent upserts):
  │    seed-feature-registry, seed-tier-features,
  │    seed-role-registry, migrate-roles, seed-changelog
  → publish-cli (npm) + publish-extension (Open VSX) + publish-action (public repo)
  → deploy-jetbrains (signed plugin → JetBrains Marketplace, version-guarded)
  → deploy-homebrew
  → deploy-web / deploy-blog / deploy-docs / deploy-admin  (vercel deploy --prod)
  → release (GitHub release with .tgz / .vsix artifacts)
```

Vercel's own git integration is disabled in each app's `vercel.json` — prod
deploys happen only through the `deploy-*` jobs.

`deploy-cli`, `deploy-extension` and `deploy-jetbrains` each compare the local
version against the registry (npm, Open VSX, JetBrains Marketplace) and skip
the publish when it is not ahead — a registry lookup failure fails the job
loudly rather than blind-publishing. Bumping the version is the release
trigger; a push that only touches docs inside those app folders is a no-op.

### Auto-seeding

The convex deploy runs the seed migrations on every deploy, so a release that
adds a gated feature, a role, or a changelog entry is live the moment it
deploys — no manual admin-panel step. All handlers are idempotent upserts.

## Required repository secrets

Deploys read these from **Settings → Secrets and variables → Actions**:

```
CONVEX_DEPLOY_KEY   NEXT_PUBLIC_CONVEX_URL   WORKOS_CLIENT_ID
NPM_TOKEN   OPEN_VSX_TOKEN   VSCODE_MARKETPLACE_TOKEN (optional)
ACTION_PUBLISH_TOKEN   HOMEBREW_TAP_PAT
VERCEL_TOKEN   VERCEL_ORG_ID
VERCEL_PROJECT_ID_WEB   VERCEL_PROJECT_ID_ADMIN
VERCEL_PROJECT_ID_BLOG  VERCEL_PROJECT_ID_DOCS
```

`ADMIN_SECRET` is read from the Convex deployment's own env (via the deploy
key), so it isn't a GitHub secret. `GITHUB_TOKEN` is automatic.

## E2E

The Playwright `e2e` job is **disabled** (guarded by `false &&` in its `if:`)
— it drove a cloud Convex dev deployment and burned the free-tier quota. Deploy
jobs accept an `e2e` result of `skipped`, so they keep working. The full local
suite is the gate of record; see
[`apps/web/tests/e2e/README.md`](../apps/web/tests/e2e/README.md). To re-enable,
remove the `false &&` in the `e2e` job's condition.
