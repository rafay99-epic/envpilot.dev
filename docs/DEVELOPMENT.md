# Development Guide

## Prerequisites

- **Bun** 1.x+ — [install](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- **Node.js** 20+ — required by some tooling (Next.js, Convex CLI)

## Quick Start

```bash
# Install all dependencies (single command, all workspaces)
bun install

# Set up environment (copies .env.example → .env.local, symlinks to web/blog/docs)
bun run setup
# Then edit .env.local with your values

# Start development (web + Convex + admin + blog + docs in parallel)
bun run dev
```

## Project Structure

```
envpilot/
├── package.json              # Workspace root (bun workspaces + Turborepo)
├── turbo.json                # Turborepo task pipeline
├── convex/                   # Convex backend (must stay at root)
│   ├── schema.ts             # Database schema (all tables)
│   ├── _generated/           # Auto-generated types (by convex dev)
│   └── *.ts                  # Backend functions (queries, mutations)
├── apps/
│   ├── web/                  # Next.js 16 web app (@envpilot/web)
│   │   ├── src/app/          # App Router pages + API routes
│   │   ├── src/components/   # React components
│   │   ├── src/hooks/        # Custom hooks (Convex query wrappers)
│   │   └── src/lib/          # Utilities (auth, vault, polar, email)
│   ├── blog/                 # Blog — blog.envpilot.dev, port 3001 (@envpilot/blog)
│   ├── docs/                 # Docs site — docs.envpilot.dev, port 3002 (@envpilot/docs)
│   ├── admin/                # Admin dashboard (@envpilot/admin)
│   ├── cli/                  # CLI tool (@envpilot/cli)
│   │   └── src/              # Commands, lib, types
│   ├── vscode-extension/     # VS Code extension (envpilot)
│   │   └── src/              # Extension, services, providers
│   └── jetbrains-plugin/     # JetBrains IDE plugin (Gradle + Kotlin)
├── packages/
│   ├── ui/                   # Shared React UI components (@envpilot/ui, TS via transpilePackages)
│   ├── github-action/        # Envpilot GitHub Action (@envpilot/github-action)
│   ├── tsconfig/             # Shared TypeScript configs
│   ├── eslint-config/        # Shared ESLint rules
│   └── prettier-config/      # Shared Prettier config
└── docs/
```

## Development Commands

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `bun run dev`             | Start web + Convex + admin + blog + docs in parallel |
| `bun run dev:admin`       | Admin dashboard dev server only                      |
| `bun run dev:blog`        | Blog dev server only (port 3001)                     |
| `bun run dev:docs`        | Docs site dev server only (port 3002)                |
| `bun run dev:cli`         | CLI watch mode (tsup)                                |
| `bun run dev:extension`   | Extension watch mode (esbuild + tsc)                 |
| `bun run build`           | Build all apps                                       |
| `bun run build:web`       | Build web app only                                   |
| `bun run build:blog`      | Build blog only                                      |
| `bun run build:docs`      | Build docs site only                                 |
| `bun run build:cli`       | Build CLI only                                       |
| `bun run build:admin`     | Build admin dashboard only                           |
| `bun run build:extension` | Build & package extension VSIX                       |
| `bun run lint`            | Lint all apps                                        |
| `bun run typecheck`       | Typecheck all apps                                   |
| `bunx prettier --check .` | Check formatting (no standalone script)              |
| `bun run format:fix`      | Auto-format all files                                |
| `bun run check:all`       | Full CI check (lint + typecheck + build + format)    |
| `bun run test:e2e`        | Playwright E2E tests (web)                           |
| `bun run test:cli`        | CLI unit tests (vitest)                              |
| `bunx convex deploy`      | Deploy Convex to production                          |

### Targeting Specific Apps

All commands use Turborepo's `--filter` flag:

```bash
bunx turbo build --filter=@envpilot/web     # web app
bunx turbo build --filter=@envpilot/cli      # CLI
bunx turbo build --filter=envpilot           # extension
```

## Environment Variables

All env vars live in a single `.env.local` at the **monorepo root**. The web, blog, and docs apps read it via symlinks (e.g. `apps/web/.env.local → ../../.env.local`). Run `bun run setup` to create the file and symlinks automatically, then fill in the values.

See `.env.example` for the full template with descriptions.

| Variable                       | Required | Description                             |
| ------------------------------ | -------- | --------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`       | Yes      | Convex deployment URL                   |
| `CONVEX_DEPLOYMENT`            | Yes      | Convex deployment name (set by CLI)     |
| `WORKOS_API_KEY`               | Yes      | WorkOS API key                          |
| `WORKOS_CLIENT_ID`             | Yes      | WorkOS client ID                        |
| `WORKOS_COOKIE_PASSWORD`       | Yes      | 32+ char secret for session cookies     |
| `WORKOS_REDIRECT_URI`          | Yes      | OAuth callback URL                      |
| `NEXT_PUBLIC_APP_URL`          | Yes      | App URL (e.g., `http://localhost:3000`) |
| `POLAR_ACCESS_TOKEN`           | No       | Polar.sh access token                   |
| `POLAR_WEBHOOK_SECRET`         | No       | Polar.sh webhook signing secret         |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | No       | Set to `true` to enable billing         |
| `RESEND_API_KEY`               | No       | Resend email API key                    |
| `FROM_EMAIL`                   | No       | Sender email address                    |

## Convex Backend

Convex functions live in `convex/` at the **monorepo root** (required by the Convex CLI).

### Adding a New Function

1. Create a file in `convex/` (e.g., `convex/myFeature.ts`)
2. Import from Convex:
   ```typescript
   import { query, mutation } from "./_generated/server";
   import { v } from "convex/values";
   ```
3. Define your function:
   ```typescript
   export const list = query({
     args: { orgId: v.id("organizations") },
     handler: async (ctx, args) => {
       return await ctx.db
         .query("myTable")
         .withIndex("by_org", (q) => q.eq("organizationId", args.orgId))
         .collect();
     },
   });
   ```
4. The `_generated/api` object updates automatically during `bun run dev`

### Schema

All tables are defined in `convex/schema.ts`. Use Convex validators (`v.*`) for args — these are separate from Zod.

### Importing Convex in the Web App

The web app uses a `@convex/*` tsconfig path alias:

```typescript
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
```

## ESLint

- **Web app**: Uses `eslint-config-next` with React Compiler rules (exhaustive-deps disabled)
- **CLI & Extension**: Import `@envpilot/eslint-config/node` (shared TypeScript rules)
- All use ESLint v9 flat config format (`.mjs` files)

## TypeScript

Shared base configs in `packages/tsconfig/`:

- `base.json` — strict, ES2022 target, skipLibCheck
- `next.json` — extends base for Next.js (dom lib, jsx, bundler resolution, noEmit)
- `node.json` — extends base for Node.js (ES2022 lib, ESNext module)

**Convex has its own independent tsconfig** (`convex/tsconfig.json`) — do not modify or merge it.

## Key Conventions

- **Path alias**: `@/*` → `./src/*` in the web app
- **React Compiler**: enabled — avoid manual `useMemo`/`useCallback`
- **Zod v4**: used for input validation in API routes and CLI
- **Convex validators** (`v.*`): used for backend function args (separate from Zod)
- **User-facing Convex errors must be `ConvexError`**: plain `Error` messages are redacted to `"Server Error"` on production deployments, so anything the client should read (validation failures, conflict messages) must be thrown as `ConvexError`
- **Tailwind CSS v4**: via PostCSS plugin
- **Authentication**: WorkOS AuthKit (session cookies for browser, bearer tokens for CLI/extension)
- **Secrets storage**: WorkOS Vault (Convex stores vault reference IDs, never plaintext)

## Web / CLI / Extension Relationships

```
┌──────────┐  ┌──────────┐  ┌──────────────┐
│  Browser │  │   CLI    │  │  VS Code Ext │
└────┬─────┘  └────┬─────┘  └──────┬───────┘
     │ cookies      │ bearer token  │ bearer token
     └──────┬───────┴───────────────┘
            ▼
   ┌─────────────────┐
   │ Next.js API      │  apps/web/src/app/api/
   │  /api/cli/*      │  ← CLI endpoints
   │  /api/extension/*│  ← Extension endpoints
   │  /api/variables/*│  ← Browser endpoints
   └────────┬────────┘
            ▼
   ┌─────────────────┐     ┌──────────────┐
   │     Convex      │────▶│ WorkOS Vault │
   │  (metadata DB)  │     │ (secrets)    │
   └─────────────────┘     └──────────────┘
```

## RBAC

Three-tier roles defined in `apps/web/src/lib/auth.ts`:

| Role          | Access                                                |
| ------------- | ----------------------------------------------------- |
| **Admin**     | Full access, variable rollback, manage permissions    |
| **Team Lead** | Manage projects/variables, grant per-variable access  |
| **Member**    | Read-only, requires explicit per-variable permissions |

## Testing

- **E2E**: Playwright (Chromium only) — `bun run test:e2e`
- **CLI**: vitest — `bun run test:cli`
- **Extension**: vitest — `bun run test:extension`

## Turborepo

Build caching is handled by `turbo.json`. Task outputs (`.next/`, `dist/`) are cached automatically.

- Use `--force` to bypass cache: `bunx turbo build --force`
- Use `--filter` to target specific packages
- The `.turbo/` directory contains local cache (gitignored)

## Adding a New Package

1. Create directory in `apps/` (for apps) or `packages/` (for shared libraries)
2. Add `package.json` with a unique `name`
3. Extend shared tsconfig: `"extends": "@envpilot/tsconfig/node.json"`
4. Import shared eslint: `import { nodeConfig } from "@envpilot/eslint-config/node"`
5. Run `bun install` to link the workspace
6. Add tasks to `turbo.json` if needed
