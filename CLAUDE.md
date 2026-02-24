# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs Next.js + Convex in parallel)
npm run dev

# Run only Next.js or Convex separately
npm run dev:next
npm run dev:convex

# Build & lint
npm run build
npm run lint

# E2E tests (Playwright, Chromium only, auto-starts dev server)
npm run test:e2e
npx playwright test tests/e2e/specific.spec.ts   # single test file
npx playwright test --ui                          # interactive UI mode

# Convex
npx convex deploy                                 # deploy functions to production
npx convex dev                                    # sync functions during development

# CLI (separate package in cli/)
cd cli && npm run build                           # build with tsup
cd cli && npm test                                # run vitest tests
cd cli && npm run dev                             # watch mode

# VS Code Extension (separate package in vscode-extension/)
cd vscode-extension && npm run compile            # build extension
```

## Architecture

ENV Connect is a secure environment variable management platform with three client surfaces: a **Next.js web app**, a **CLI tool**, and a **VS Code extension**.

### Data Flow

```
Browser/CLI/Extension → Next.js API Routes → Convex (database) + WorkOS Vault (encrypted secrets)
                              ↓
                    WorkOS AuthKit (auth) + Stripe (billing) + Resend (email)
```

- **Convex** is the real-time database. Functions in `convex/` are auto-deployed during `npm run dev`. React components consume data via `useQuery`/`useMutation` from `convex/react` with the auto-generated `api` object.
- **WorkOS Vault** stores actual secret values. Convex only stores vault reference IDs, never plaintext secrets. See `src/lib/vault.ts`.
- **WorkOS AuthKit** handles authentication. Middleware in `src/middleware.ts` protects all routes except those in `unauthenticatedPaths`.

### Key Directories

- `convex/` — Backend functions (queries, mutations) and `schema.ts` (database schema). Auto-generates types in `convex/_generated/`. Independent from the main tsconfig.
- `src/app/api/` — Next.js API routes. Use `withAuth()` middleware for auth. Use `ConvexHttpClient` for server-side Convex calls.
- `src/hooks/` — Custom React hooks wrapping Convex queries (useOrganizations, useProjects, useVariables, usePermissions, etc.).
- `src/lib/` — Shared utilities: auth, vault, stripe, email, tier-limits, feature-flags.
- `cli/` — Independent npm package (`@env-connect/cli`). Uses Commander.js, builds with tsup, tests with vitest.
- `vscode-extension/` — Independent VS Code extension package. OAuth-based auth, real-time sync service.

### Roles & Permissions

Three-tier RBAC defined in `src/lib/auth.ts`:
- **Admin** — Full access including variable rollback and permission management
- **Team Lead** — Manage projects/variables, grant/revoke per-variable access
- **Member** — Read-only projects; variable access requires explicit per-variable permissions

### Important Conventions

- Path alias: `@/*` maps to `./src/*`
- React Compiler is enabled (Next.js `reactCompiler: true`) — avoid manual `useMemo`/`useCallback`
- Zod v4 for input validation in API routes
- Convex validators (`v.*`) for backend function args, separate from Zod
- Tailwind CSS v4 via PostCSS
- Three separate TypeScript configs: root (web app), `cli/tsconfig.json`, `vscode-extension/tsconfig.json`

### Environment Variables

Required in `.env.local`: `NEXT_PUBLIC_CONVEX_URL`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_APP_URL`. See `.env.example`.
