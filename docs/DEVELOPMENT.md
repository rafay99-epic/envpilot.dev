# Development Guide

This guide covers setting up and running ENV Connect locally for development.

## Prerequisites

- **[Bun](https://bun.sh/)** v1.2+ -- package manager and runtime
- **[Git](https://git-scm.com/)** -- version control
- **[Convex](https://convex.dev/) account** -- real-time backend
- **[WorkOS](https://workos.com/) account** -- authentication

## Quick Start

```bash
# 1. Clone and install
git clone <repository-url>
cd env-connect
bun install

# 2. Set up environment variables
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local (see Environment Variables section)

# 3. Log in to Convex
bunx convex login

# 4. Start development (Next.js + Convex in parallel)
bun run dev
```

The web app will be at `http://localhost:3000`.

## Project Structure

```
env-connect/
├── apps/
│   ├── web/                      # Next.js 16 web application
│   │   ├── src/
│   │   │   ├── app/              # App Router pages & API routes
│   │   │   │   ├── (auth)/       # Auth routes (sign-in, sign-up, callback)
│   │   │   │   ├── (dashboard)/  # Dashboard routes
│   │   │   │   └── api/          # REST API endpoints
│   │   │   ├── components/       # React components
│   │   │   ├── hooks/            # Custom hooks (Convex query wrappers)
│   │   │   └── lib/              # Utilities (auth, vault, stripe, email)
│   │   ├── public/               # Static assets
│   │   ├── tests/                # Playwright E2E tests
│   │   ├── next.config.ts        # Next.js config (React Compiler, Turbopack)
│   │   ├── tsconfig.json         # TypeScript config with @/* and @convex/* aliases
│   │   └── package.json
│   ├── cli/                      # CLI tool (@env-connect/cli)
│   │   ├── src/
│   │   │   ├── commands/         # CLI commands (init, login, pull, push, etc.)
│   │   │   ├── lib/              # API client, config, env file parsing
│   │   │   └── types/            # Type definitions
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── vscode-extension/         # VS Code extension
│       ├── src/
│       │   ├── extension.ts      # Extension entry point
│       │   ├── providers/        # Tree view providers
│       │   ├── services/         # API, auth, sync, real-time
│       │   ├── ui/               # Dialogs
│       │   └── utils/            # Storage, config, paths
│       ├── media/                # Extension icon/assets
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── shared-types/             # Common TypeScript interfaces
│   │   └── src/index.ts          # User, Organization, Project, etc.
│   └── eslint-config/            # Shared ESLint presets
│       ├── base.mjs              # Common rules
│       ├── next.mjs              # Next.js preset
│       └── node.mjs              # CLI/extension preset
├── convex/                       # Convex backend
│   ├── schema.ts                 # Database schema (28 tables)
│   ├── _generated/               # Auto-generated types (gitignored)
│   ├── *.ts                      # Query/mutation functions
│   ├── tsconfig.json
│   └── package.json
├── docs/                         # Documentation
├── turbo.json                    # Turborepo config
└── package.json                  # Workspace root
```

## Environment Variables

### Required

Create `apps/web/.env.local`:

```bash
# Convex
NEXT_PUBLIC_CONVEX_URL=<your-convex-deployment-url>

# WorkOS Authentication
WORKOS_API_KEY=<your-workos-api-key>
WORKOS_CLIENT_ID=<your-workos-client-id>
WORKOS_COOKIE_PASSWORD=<32-character-random-string>

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Optional

```bash
# Stripe (billing -- only needed if working on billing features)
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<your-stripe-publishable-key>

# Resend (email -- only needed if working on invitation emails)
RESEND_API_KEY=<your-resend-api-key>
```

Generate a cookie password:

```bash
openssl rand -base64 32
```

## Setting Up Services

### 1. Convex Backend

```bash
# Log in to Convex
bunx convex login

# First time: initialize a new project
bunx convex init

# Or link to existing project
bunx convex dev --configure
```

After setup, Convex provides your `NEXT_PUBLIC_CONVEX_URL`.

### 2. WorkOS Authentication

1. Create a [WorkOS](https://workos.com) account
2. Create a new project in the dashboard
3. Go to **Authentication** > **AuthKit**
4. Add redirect URI: `http://localhost:3000/callback`
5. Copy **API Key** and **Client ID** to `.env.local`
6. Enable sign-in methods (email, Google, etc.)

## Development Commands

### Start Everything

```bash
bun run dev
```

This uses Turborepo to run all workspace `dev` scripts in parallel:

- Next.js dev server on `http://localhost:3000`
- Convex dev server syncing functions and schema

### Run Services Separately

```bash
# In separate terminals:
cd apps/web && bun run dev:next      # Next.js only
cd apps/web && bun run dev:convex    # Convex only
```

### Build

```bash
# Build all apps
bun run build

# Build individually
cd apps/web && bun run build                    # Next.js production build
cd apps/cli && bun run build                    # CLI (tsup -> dist/index.js)
cd apps/vscode-extension && bun run compile     # Extension (esbuild -> dist/extension.js)
```

### Quality Checks

```bash
bun run lint             # ESLint across all workspaces
bun run typecheck        # TypeScript checking across all workspaces
bun run format:check     # Prettier formatting check
bun run format:fix       # Auto-fix formatting
```

### Testing

```bash
# E2E tests (auto-starts dev server)
bun run test:e2e

# Interactive test UI
cd apps/web && bunx playwright test --ui

# Run a specific test file
cd apps/web && bunx playwright test tests/e2e/specific.spec.ts

# CLI unit tests
cd apps/cli && bun test

# CLI tests in watch mode
cd apps/cli && bun run test:watch
```

## Working with the CLI

The CLI is at `apps/cli/`. It's an independent npm package that communicates with the web app via HTTP API.

```bash
cd apps/cli

# Build
bun run build

# Watch mode (rebuild on changes)
bun run dev

# Run locally after building
./dist/index.js --help

# Run tests
bun test
```

**Key files:**

- `src/commands/` -- Each command (init, login, pull, push, etc.)
- `src/lib/api.ts` -- HTTP client that calls the web app's API routes
- `src/lib/config.ts` -- User config management (`conf` package)
- `src/types/index.ts` -- Type definitions with Zod schemas

## Working with the VS Code Extension

The extension is at `apps/vscode-extension/`. It uses OAuth-based auth and real-time sync.

```bash
cd apps/vscode-extension

# Build (compile + lint + typecheck)
bun run compile

# Watch mode (rebuild on changes, useful during development)
bun run watch

# Package as .vsix for installation
bun run package
bunx @vscode/vsce package
```

**To test the extension in VS Code:**

1. Open `apps/vscode-extension/` in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension activates in workspaces containing `.env*` files

**Key files:**

- `src/extension.ts` -- Main entry point, command registration
- `src/services/sync.ts` -- Variable sync logic
- `src/services/auth.ts` -- OAuth authentication
- `src/services/realTimeSync.ts` -- Permission revocation detection
- `src/providers/` -- Tree view data providers

## Working with the Convex Backend

Convex functions are in `convex/` at the repo root. They auto-deploy during `bun run dev`.

### Modifying the Schema

Edit `convex/schema.ts`. Convex auto-migrates during development.

### Adding Backend Functions

```typescript
// convex/example.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});
```

### Using Convex in the Web App

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

function MyComponent() {
  const data = useQuery(api.example.list, { projectId });
  const doSomething = useMutation(api.example.myMutation);
  // ...
}
```

Note: The web app imports Convex via the `@convex/*` path alias (defined in `apps/web/tsconfig.json`).

### Deploy to Production

```bash
cd convex && bun run deploy
```

## Path Aliases

The web app uses two TypeScript path aliases:

| Alias       | Resolves To            | Example                                        |
| ----------- | ---------------------- | ---------------------------------------------- |
| `@/*`       | `apps/web/src/*`       | `import { auth } from "@/lib/auth"`            |
| `@convex/*` | `convex/*` (repo root) | `import { api } from "@convex/_generated/api"` |

## Adding Dependencies

```bash
# Add to a specific workspace
cd apps/web && bun add <package>
cd apps/cli && bun add <package>

# Add to root (dev tools shared across all workspaces)
bun add -d <package> --cwd .
```

## Turborepo

The monorepo uses Turborepo for task orchestration. See `turbo.json` for the task pipeline.

- `build` tasks depend on upstream builds (`^build`)
- `dev` tasks are persistent (long-running) and never cached
- `lint` and `typecheck` run independently per workspace

Turbo caches build outputs (`.next/`, `dist/`) for faster rebuilds.

## Troubleshooting

### Convex Connection Issues

```bash
rm -rf .convex
cd convex && bun run dev
```

### WorkOS Authentication Errors

- **"Invalid redirect URI"** -- Ensure `http://localhost:3000/callback` is in your WorkOS dashboard
- **"Cookie password too short"** -- `WORKOS_COOKIE_PASSWORD` must be 32+ characters
- **"API key invalid"** -- Check you're using the dev (not production) key

### Build Errors

```bash
# Clean all build outputs and rebuild
rm -rf apps/web/.next apps/cli/dist apps/vscode-extension/dist .turbo
bun run build
```

### Port Already in Use

```bash
lsof -ti:3000 | xargs kill -9
```

### Dependency Issues

```bash
# Clean and reinstall everything
rm -rf node_modules apps/*/node_modules bun.lock
bun install
```

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- See the root [README.md](../README.md) for project overview
