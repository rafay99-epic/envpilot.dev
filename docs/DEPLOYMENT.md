# Deployment Guide

## Overview

ENV Connect deploys to three platforms:

| Component         | Platform            | Command                      |
| ----------------- | ------------------- | ---------------------------- |
| Web App           | Vercel              | Automatic on push to `main`  |
| Convex Backend    | Convex Cloud        | `bun run convex:deploy`      |
| VS Code Extension | VS Code Marketplace | `npx @vscode/vsce publish`   |
| CLI               | npm Registry        | `cd apps/cli && npm publish` |

## Web App (Vercel)

### Setup

1. Connect the GitHub repo to Vercel
2. Configure the project:
   - **Framework**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && bun install && bunx turbo build --filter=@env-connect/web`
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
| `STRIPE_SECRET_KEY`      | `sk_live_...`                       |
| `STRIPE_WEBHOOK_SECRET`  | `whsec_...`                         |
| `RESEND_API_KEY`         | `re_...`                            |

### Deploy

Vercel auto-deploys on push to `main`. For manual deploy:

```bash
cd apps/web && npx vercel --prod
```

## Convex Backend

### Setup

1. Create a Convex project at [dashboard.convex.dev](https://dashboard.convex.dev)
2. Get the deployment URL (format: `https://your-project.convex.cloud`)
3. Set `NEXT_PUBLIC_CONVEX_URL` in your web app environment

### Deploy

From the **monorepo root**:

```bash
bun run convex:deploy
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
npx @vscode/vsce package
```

This creates a `.vsix` file (e.g., `env-connect-0.1.0.vsix`).

### Publish

```bash
cd apps/vscode-extension
npx @vscode/vsce publish
```

Requirements:

- A Personal Access Token from [Azure DevOps](https://dev.azure.com)
- Publisher `env-connect` registered in the [VS Code Marketplace](https://marketplace.visualstudio.com/manage)

### Version Bump

Update `version` in `apps/vscode-extension/package.json` before publishing.

### Extension Configuration

The extension connects to the web app at the URL configured in `envConnect.serverUrl` setting (defaults to `http://localhost:3000`). For production, users should set this to the Vercel deployment URL.

## CLI

### Build

```bash
bun run build:cli
```

### Publish to npm

```bash
cd apps/cli
npm publish
```

Requirements:

- npm account with publish access to `@env-connect` scope
- Run `npm login` first

### Version Bump

Update `version` in `apps/cli/package.json` before publishing.

### Binary

After installation (`npm install -g @env-connect/cli`), the CLI is available as `env-connect`.

## CI/CD

### GitHub Actions

The CI workflow (`.github/workflows/ci.yml`) runs on:

- Push to `main`
- Pull requests
- Manual dispatch

### Jobs

| Job              | What it checks                   |
| ---------------- | -------------------------------- |
| **App**          | Web typecheck, lint, build       |
| **CLI**          | CLI lint, build                  |
| **Extension**    | Extension typecheck, lint, build |
| **Format**       | Prettier check across monorepo   |
| **React Doctor** | React best practices validation  |

All jobs use:

- `bun install --frozen-lockfile` (single install from root)
- `bunx turbo <task> --filter=<package>` for workspace commands

### Required Secrets

The CI uses mock values for environment variables (no real credentials needed for builds).

## Monitoring

- **Vercel**: Dashboard at [vercel.com](https://vercel.com) for deploy logs, analytics
- **Convex**: Dashboard at [dashboard.convex.dev](https://dashboard.convex.dev) for function logs, data browser
- **Stripe**: Dashboard for payment monitoring, webhook logs
- **WorkOS**: Dashboard for auth events, user management
