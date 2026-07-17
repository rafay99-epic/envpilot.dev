# Deployment Guide

## Overview

Envpilot deploys to multiple platforms. The **GitHub Actions** pipeline
(`.github/workflows/ci.yml` + `deploy-*.yml`) handles all deployments on push
to `main` — see [CI docs](ci.md) for how the workflow is built. Deploy jobs
run only on `main`, backend first (clients require `deploy-convex`). The old
CircleCI config is retained, disabled, at `.circleci/config.yml.old`.

| Component                 | Platform                        | Trigger                                              |
| ------------------------- | ------------------------------- | ---------------------------------------------------- |
| Web / Blog / Docs / Admin | Vercel (`vercel deploy --prod`) | GitHub Actions `deploy-*` job when the app changed   |
| Convex Backend            | Convex Cloud                    | GitHub Actions detects `convex/` changes             |
| VS Code Extension         | Open VSX                        | GitHub Actions `publish-extension` on a version bump |
| CLI                       | npm Registry                    | GitHub Actions `publish-cli` on a version bump       |
| GitHub Action             | public `envpilot-action` repo   | GitHub Actions `publish-action` on a version bump    |

> Vercel's own git integration (including previews) is **disabled** in every
> app's `vercel.json` — prod deploys happen only through the GitHub Actions jobs,
> which run `vercel deploy --prod` on Vercel infra.

## Web App (Vercel)

### Setup

1. Connect the GitHub repo to Vercel
2. Configure the project:
   - **Framework**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && bun install && bunx turbo build --filter=@envpilot/web`
   - **Install Command**: `bun install` (from monorepo root)
   - **Output Directory**: `.next`

### Environment Variables

Set these in Vercel's project settings:

| Variable                 | Example                             |
| ------------------------ | ----------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | `https://your-project.convex.cloud` |
| `WORKOS_API_KEY`         | `sk_live_...`                       |
| `WORKOS_CLIENT_ID`       | `client_...`                        |
| `WORKOS_COOKIE_PASSWORD` | 32+ character secret                |
| `NEXT_PUBLIC_APP_URL`    | `https://your-domain.com`           |
| `WORKOS_REDIRECT_URI`    | `https://your-domain.com/callback`  |
| `POLAR_ACCESS_TOKEN`     | `polar_...`                         |
| `POLAR_WEBHOOK_SECRET`   | `whsec_...`                         |
| `RESEND_API_KEY`         | `re_...`                            |

### Deploy

Production deploys run through the GitHub Actions `deploy-web` job (`vercel deploy
--prod`) — Vercel's git integration is disabled, so pushes do not auto-deploy.
The blog, docs, and admin apps deploy the same way via their own `deploy-*`
jobs. For a manual deploy:

```bash
cd apps/web && bunx vercel --prod
```

## Convex Backend

### Setup

1. Create a Convex project at [dashboard.convex.dev](https://dashboard.convex.dev)
2. Get the deployment URL (format: `https://your-project.convex.cloud`)
3. Set `NEXT_PUBLIC_CONVEX_URL` in your web app environment

### Deploy

From the **monorepo root**:

```bash
bunx convex deploy
```

This pushes all functions from `convex/` to Convex Cloud. Schema changes are applied automatically.

### Important Notes

- The `convex/` directory **must** stay at the monorepo root (Convex CLI requirement)
- `convex deploy` reads from `convex/` relative to the current working directory
- Schema migrations are handled by Convex — breaking changes may require data backfill
- Auto-generated types in `convex/_generated/` are created during `convex dev` and `convex deploy`

## VS Code Extension

### Build

```bash
bun run build:extension
```

### Package

```bash
cd apps/vscode-extension
bunx @vscode/vsce package --no-dependencies
```

This creates a `.vsix` file (e.g., `envpilot-1.3.7.vsix`).

### Publish

```bash
cd apps/vscode-extension

# VS Code Marketplace (also available in Cursor)
bunx @vscode/vsce publish --no-dependencies

# Open VSX Registry (VS Codium, Gitpod, Theia)
bunx ovsx publish envpilot-*.vsix -p $OPEN_VSX_TOKEN
```

Requirements:

- A Personal Access Token from [Azure DevOps](https://dev.azure.com) for VS Code Marketplace
- An access token from [open-vsx.org](https://open-vsx.org) for Open VSX
- Publisher `envpilot` registered in the [VS Code Marketplace](https://marketplace.visualstudio.com/manage)

### Version Bump

Update `version` in `apps/vscode-extension/package.json` before publishing.

### Extension Configuration

The extension connects to the web app at the URL configured in `envpilot.serverUrl` setting (defaults to `http://localhost:3000`). For production, users should set this to the Vercel deployment URL.

## CLI

### Build

```bash
bun run build:cli
```

### Publish to npm

```bash
cd apps/cli
bun publish --access public
```

Requirements:

- npm account with publish access to `@envpilot` scope
- Auth configured in `~/.npmrc`

### Version Bump

Update `version` in `apps/cli/package.json` before publishing.

### Binary

After installation (`bun install -g @envpilot/cli`), the CLI is available as `envpilot`.

## CI/CD

The GitHub Actions pipeline (`.github/workflows/ci.yml` + `deploy-*.yml`)
handles everything on push to `main`:

```
quality → per-surface build → deploy-convex → publish-cli / publish-extension /
publish-action → deploy-homebrew → deploy-web / -blog / -docs / -admin → release
```

See [CI docs](ci.md) for how the pipeline is built, the required secrets, and
how to run on CircleCI instead (its config is retained, disabled, at
`.circleci/config.yml.old`).

Publish/deploy credentials are stored as **GitHub repository secrets** (Convex
deploy key, npm token, Open VSX token, Vercel token/project ids, the
`ACTION_PUBLISH_TOKEN` for the public action repo, Homebrew tap token).

## Monitoring

- **Vercel**: Dashboard at [vercel.com](https://vercel.com) for deploy logs, analytics
- **Convex**: Dashboard at [dashboard.convex.dev](https://dashboard.convex.dev) for function logs, data browser
- **Polar.sh**: Dashboard for payment monitoring, webhook logs
- **WorkOS**: Dashboard for auth events, user management
