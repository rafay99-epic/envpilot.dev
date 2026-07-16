# CI / CD

CI/CD runs on **CircleCI** ("pipeline v2"), a dynamic config split across
`.circleci/config.yml` (setup) and `.circleci/jobs.yml` (job definitions).

## How the pipeline is built

Every push starts with a tiny setup job, `detect` (`.circleci/config.yml`),
that diffs the push, maps changed paths to **surfaces**, and _generates_ the
workflow so only the relevant jobs exist:

| Changed path                                           | Surface(s) built            |
| ------------------------------------------------------ | --------------------------- |
| `convex/`                                              | convex                      |
| `apps/web/`, `apps/blog/`, `apps/docs/`, `apps/admin/` | web / blog / docs / admin   |
| `apps/cli/`, `apps/vscode-extension/`                  | cli / extension             |
| `packages/github-action/`                              | action                      |
| `packages/ui/`                                         | web + blog + docs (fan-out) |
| root manifests, shared configs, `.circleci/`           | all surfaces                |

Branch pushes diff against the fork point with `main`; `main` pushes diff the
merge itself.

## Quality gate first

Every generated pipeline starts with a single **quality** job (prettier, lint,
typecheck via `next typegen`, convex `tsc` — no builds). Per-surface **build**
jobs `require: [quality]`. CLI and extension build DIRECT via `bun run build`
(never turbo).

## Deploys (main pipelines only)

Deploy jobs are added only when the branch is `main`. Ordering is strict —
**backend first**: client publishes and web/blog/docs/admin deploys that need
the backend contract `require` `deploy-convex` when it exists.

```
deploy-convex (+ feature-registry / changelog seeds)
  → publish-cli (npm) + publish-extension (Open VSX) + publish-action (public envpilot-action repo)
  → deploy-homebrew
  → deploy-web / deploy-blog / deploy-docs / deploy-admin (CI-gated `vercel deploy --prod`)
  → release (GitHub release with .tgz / .vsix artifacts)
```

Vercel prod deploys run through the CircleCI `deploy-*` jobs — Vercel's own git
integration is disabled (see `vercel.json` in each app).

## Manual control

From the CircleCI UI (**Trigger Pipeline**) or API, pass parameters to force
surfaces: `force-<surface>: true` runs that surface's jobs even if unchanged;
`run-everything: true` runs all of them. Forcing on a branch runs builds only —
deploys still happen only on `main`.

## GitHub Actions — dormant

The workflow files under `.github/workflows/` (`ci.yml`, `deploy-*.yml`,
`version-tracker.yml`) are kept for reference but their triggers are
**`workflow_dispatch`-only** — nothing runs there and GitHub Actions billing is
not used. To move CI back to GitHub Actions, restore the original triggers on
those files.

## E2E

Playwright is **not** run in CI (disabled by design — it drove a cloud Convex
dev deployment and burned the free-tier quota). The full local suite is the
gate of record; see [`apps/web/tests/e2e/README.md`](../apps/web/tests/e2e/README.md).
