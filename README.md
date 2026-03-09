# ENV Connect

Secure environment variable management for teams. ENV Connect provides a centralized platform for managing, sharing, and syncing environment variables across your development team and deployment environments.

## Features

- **Secure Variable Storage** -- Environment variables encrypted via WorkOS Vault
- **Real-Time Sync** -- Changes propagate instantly via Convex real-time database
- **Team Management** -- Invite members, assign roles, control access
- **Granular Permissions** -- Per-variable access control with Admin / Team Lead / Member roles
- **Audit Logging** -- Track all changes and access
- **CLI Tool** -- Pull/push variables from the terminal
- **VS Code Extension** -- Sync variables directly into your editor

## Tech Stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Web App  | [Next.js 16](https://nextjs.org/) + React 19 + React Compiler |
| Backend  | [Convex](https://convex.dev/) real-time database              |
| Auth     | [WorkOS AuthKit](https://workos.com/docs/user-management)     |
| Secrets  | [WorkOS Vault](https://workos.com/docs/vault)                 |
| Billing  | [Stripe](https://stripe.com/)                                 |
| Styling  | [Tailwind CSS v4](https://tailwindcss.com/)                   |
| Testing  | [Playwright](https://playwright.dev/)                         |
| Monorepo | [Turborepo](https://turbo.build/) + [Bun](https://bun.sh/)    |

## Monorepo Structure

```
env-connect/
├── apps/
│   ├── web/                  # Next.js web application
│   ├── cli/                  # CLI tool (@env-connect/cli)
│   └── vscode-extension/     # VS Code extension
├── packages/
│   ├── shared-types/         # Common TypeScript interfaces
│   └── eslint-config/        # Shared ESLint presets
├── convex/                   # Convex backend functions & schema
├── docs/                     # Documentation
├── turbo.json                # Turborepo task pipeline
└── package.json              # Workspace root
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.2+ (package manager and runtime)
- [Git](https://git-scm.com/)
- A [Convex](https://convex.dev/) account
- A [WorkOS](https://workos.com/) account

### Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd env-connect

# 2. Install all dependencies (root + all workspaces)
bun install

# 3. Set up environment variables
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local with your keys (see Environment Variables below)

# 4. Log in to Convex
bunx convex login

# 5. Start everything (Next.js + Convex dev server)
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the web app.

### Environment Variables

Create `apps/web/.env.local` with:

```bash
NEXT_PUBLIC_CONVEX_URL=<your-convex-deployment-url>
WORKOS_API_KEY=<your-workos-api-key>
WORKOS_CLIENT_ID=<your-workos-client-id>
WORKOS_COOKIE_PASSWORD=<32-character-random-string>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Generate a cookie password: `openssl rand -base64 32`

## Commands

All commands are run from the repository root unless noted otherwise.

### Development

```bash
bun run dev              # Start web app + Convex backend in parallel
```

To run services separately:

```bash
cd apps/web && bun run dev:next      # Next.js only (http://localhost:3000)
cd apps/web && bun run dev:convex    # Convex only
cd apps/cli && bun run dev           # CLI in watch mode
cd apps/vscode-extension && bun run watch  # Extension in watch mode
```

### Build

```bash
bun run build            # Build all apps (web + CLI + extension)
bun run build:all        # Same as above (alias)
```

Build individual apps:

```bash
cd apps/web && bun run build                    # Next.js production build
cd apps/cli && bun run build                    # CLI (tsup -> dist/)
cd apps/vscode-extension && bun run compile     # Extension (esbuild -> dist/)
```

### Quality

```bash
bun run lint             # Lint all workspaces
bun run typecheck        # Typecheck all workspaces
bun run format:check     # Check formatting (Prettier)
bun run format:fix       # Fix formatting
```

### Testing

```bash
bun run test:e2e                          # Run Playwright E2E tests
cd apps/web && bunx playwright test --ui  # Interactive test UI
cd apps/cli && bun test                   # CLI unit tests (vitest)
```

### Convex

```bash
cd convex && bun run dev       # Sync functions during development
cd convex && bun run deploy    # Deploy functions to production
```

## Documentation

- [Development Guide](./docs/DEVELOPMENT.md) -- Local setup, services configuration, workflows
- [Deployment Guide](./docs/DEPLOYMENT.md) -- Production deployment instructions

## Architecture

### Data Flow

```
Browser / CLI / Extension
         │
         ▼
  Next.js API Routes (apps/web/src/app/api/)
         │
    ┌────┴────┐
    ▼         ▼
  Convex    WorkOS Vault
(database)  (encrypted secrets)
```

### Authentication

1. User signs in via WorkOS AuthKit
2. Callback route creates session, syncs user to Convex
3. Protected routes verify session via middleware

### Roles & Permissions

| Role          | Capabilities                                                   |
| ------------- | -------------------------------------------------------------- |
| **Admin**     | Full access, variable rollback, permission management          |
| **Team Lead** | Manage projects/variables, grant/revoke per-variable access    |
| **Member**    | Read-only projects, requires explicit per-variable permissions |

## Security

- All secret values encrypted via WorkOS Vault (Convex stores only vault reference IDs)
- Role-based access control with per-variable granularity
- Session management with secure cookies
- Comprehensive audit logging of all operations

## License

Private -- All rights reserved
