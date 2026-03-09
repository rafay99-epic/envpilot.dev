# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This is a **Turborepo monorepo** using **Bun** as the package manager.

```
root/
├── apps/
│   ├── web/                  # Next.js web app
│   ├── cli/                  # CLI tool (@env-connect/cli)
│   └── vscode-extension/     # VS Code extension
├── packages/
│   ├── shared-types/         # Common TypeScript interfaces (@env-connect/shared-types)
│   └── eslint-config/        # Shared ESLint presets (@env-connect/eslint-config)
├── convex/                   # Convex backend (stays at root for CLI compatibility)
├── turbo.json                # Turborepo task pipeline
└── package.json              # Workspace root
```

## Commands

```bash
# Development (runs all workspace dev tasks in parallel via Turbo)
bun run dev

# Run only the web app or Convex separately
bun run dev:web
bun run dev:convex

# Build all workspaces
bun run build

# Build individual workspaces
bun run build:web
bun run build:cli
bun run build:extension

# Package extension as .vsix
bun run package:extension

# Lint all workspaces
bun run lint

# Typecheck all workspaces
bun run typecheck

# E2E tests (Playwright, Chromium only, auto-starts dev server)
bun run test:e2e
cd apps/web && bunx playwright test tests/e2e/specific.spec.ts   # single test file
cd apps/web && bunx playwright test --ui                          # interactive UI mode

# Convex
cd convex && bun run deploy                                       # deploy functions to production
cd convex && bun run dev                                          # sync functions during development

# CLI (in apps/cli/)
cd apps/cli && bun run build                                      # build with tsup
cd apps/cli && bun test                                           # run vitest tests
cd apps/cli && bun run dev                                        # watch mode

# VS Code Extension (in apps/vscode-extension/)
cd apps/vscode-extension && bun run build                         # build extension
bun run dev:extension                                             # watch mode for debugging

# Formatting
bun run format:check
bun run format:fix
```

## Architecture

ENV Connect is a secure environment variable management platform with three client surfaces: a **Next.js web app**, a **CLI tool**, and a **VS Code extension**.

### Data Flow

```
Browser/CLI/Extension → Next.js API Routes → Convex (database) + WorkOS Vault (encrypted secrets)
                              ↓
                    WorkOS AuthKit (auth) + Stripe (billing) + Resend (email)
```

- **Convex** is the real-time database. Functions in `convex/` are auto-deployed during `bun run dev`. React components consume data via `useQuery`/`useMutation` from `convex/react` with the auto-generated `api` object.
- **WorkOS Vault** stores actual secret values. Convex only stores vault reference IDs, never plaintext secrets. See `apps/web/src/lib/vault.ts`.
- **WorkOS AuthKit** handles authentication. Middleware protects all routes except those in `unauthenticatedPaths`.

### Key Directories

- `convex/` — Backend functions (queries, mutations) and `schema.ts` (database schema). Auto-generates types in `convex/_generated/`. Has its own `package.json` and `tsconfig.json`.
- `apps/web/src/app/api/` — Next.js API routes. Use `withAuth()` middleware for auth. Use `ConvexHttpClient` for server-side Convex calls.
- `apps/web/src/hooks/` — Custom React hooks wrapping Convex queries (useOrganizations, useProjects, useVariables, usePermissions, etc.).
- `apps/web/src/lib/` — Shared utilities: auth, vault, stripe, email, tier-limits, feature-flags.
- `apps/cli/` — Independent npm package (`@env-connect/cli`). Uses Commander.js, builds with tsup, tests with vitest.
- `apps/vscode-extension/` — Independent VS Code extension package. OAuth-based auth, real-time sync service.
- `packages/shared-types/` — Common TypeScript interfaces shared across web, CLI, and extension.
- `packages/eslint-config/` — Shared ESLint presets: `next` (web), `node` (CLI/extension), `base` (common rules).

### Roles & Permissions

Three-tier RBAC defined in `apps/web/src/lib/auth.ts`:

- **Admin** — Full access including variable rollback and permission management
- **Team Lead** — Manage projects/variables, grant/revoke per-variable access
- **Member** — Read-only projects; variable access requires explicit per-variable permissions

### Important Conventions

- Path alias: `@/*` maps to `./src/*` (in web app)
- Path alias: `@convex/*` maps to `../../convex/*` (web app imports Convex types)
- React Compiler is enabled (Next.js `reactCompiler: true`) — avoid manual `useMemo`/`useCallback`
- Zod v4 for input validation in API routes
- Convex validators (`v.*`) for backend function args, separate from Zod
- Tailwind CSS v4 via PostCSS
- Four separate TypeScript configs: `apps/web/tsconfig.json`, `apps/cli/tsconfig.json`, `apps/vscode-extension/tsconfig.json`, `convex/tsconfig.json`

### Environment Variables

Required in `apps/web/.env.local`: `NEXT_PUBLIC_CONVEX_URL`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_APP_URL`. See `.env.example`.
