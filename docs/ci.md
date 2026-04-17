# CI / CD

## Pipeline Overview

All CI/CD runs through a single unified workflow (`.github/workflows/ci-deploy.yml`).

### On Pull Requests

```
quality ──→ build ──→ (stop, no deploys)
   │
   └──→ react-doctor (advisory)
```

| Stage            | What it does                                                  |
| ---------------- | ------------------------------------------------------------- |
| **Quality**      | Lint + Typecheck + Format check                               |
| **Build**        | Builds all packages + packages VSIX and CLI tarball artifacts |
| **React Doctor** | Advisory React audit (non-blocking)                           |

A separate `version-tracker.yml` runs on PRs to compare package versions and auto-label PRs with `semver:*` and `scope:*` labels.

### On Push to Main

```
quality ──→ build ──→ detect ──→ deploy-convex
                               ──→ deploy-extension
                               ──→ deploy-cli
                               ──→ release
```

| Stage       | What it does                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| **Quality** | Same as PR                                                                                                        |
| **Build**   | Same as PR                                                                                                        |
| **Detect**  | Checks what changed (convex, extension, CLI, web, admin)                                                          |
| **Deploy**  | Deploys only what changed (parallel)                                                                              |
| **Release** | Creates unified GitHub Release with deployment summary + build artifacts (VSIX, CLI tarball) for changed packages |

### Deploy Targets

| Package       | Where                          | Trigger                                          |
| ------------- | ------------------------------ | ------------------------------------------------ |
| **Convex**    | Convex Cloud                   | Files in `convex/` changed                       |
| **Extension** | VS Code Marketplace + Open VSX | Version bumped in `package.json`                 |
| **CLI**       | npm Registry                   | Version bumped in `package.json`                 |
| **Web**       | Vercel                         | Automatic (managed by Vercel, not this pipeline) |

## Required GitHub Secrets

| Secret                     | Purpose                                                   |
| -------------------------- | --------------------------------------------------------- |
| `CONVEX_DEPLOY_KEY`        | Convex production deploy (environment secret: Production) |
| `NPM_TOKEN`                | npm publish for CLI                                       |
| `OPEN_VSX_TOKEN`           | Open VSX Registry publish                                 |
| `VSCODE_MARKETPLACE_TOKEN` | VS Code Marketplace publish                               |

## Workflow Files

| File                  | Purpose                               |
| --------------------- | ------------------------------------- |
| `ci-deploy.yml`       | Unified CI/CD pipeline                |
| `version-tracker.yml` | PR version comparison + auto-labeling |
