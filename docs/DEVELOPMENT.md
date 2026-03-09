# Development Guide

This guide covers setting up and running ENV Connect locally for development.

## Prerequisites

- **Bun** 1.2+ ([install](https://bun.sh/))
- **Git** for version control

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd ENV_Connect

# 2. Install dependencies
bun install

# 3. Set up environment variables
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local (see Environment Variables below)

# 4. Start development (web + Convex)
bun run dev
```

The web app will be available at `http://localhost:3000`.

## Project Structure

```
root/
├── apps/
│   ├── web/                  # Next.js web app
│   │   ├── src/app/          # App Router pages and API routes
│   │   ├── src/components/   # React components
│   │   ├── src/hooks/        # Custom React hooks
│   │   ├── src/lib/          # Utilities (auth, vault, stripe)
│   │   └── public/           # Static assets
│   ├── cli/                  # CLI tool (@env-connect/cli)
│   │   └── src/              # CLI source (Commander.js)
│   └── vscode-extension/     # VS Code extension
│       └── src/              # Extension source
├── packages/
│   ├── shared-types/         # Common TypeScript interfaces
│   └── eslint-config/        # Shared ESLint presets
├── convex/                   # Convex backend functions + schema
│   ├── _generated/           # Auto-generated types (gitignored)
│   └── schema.ts             # Database schema
└── docs/                     # Documentation
```

## Environment Variables

Create `apps/web/.env.local` with:

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

## Setting Up Services

### Convex Backend

```bash
# Login to Convex
bunx convex login

# Initialize or link project
bunx convex dev --configure
```

After setup, Convex provides your `NEXT_PUBLIC_CONVEX_URL`.

### WorkOS Authentication

1. Create a WorkOS account at [workos.com](https://workos.com)
2. Configure redirect URIs: `http://localhost:3000/callback`
3. Copy API Key and Client ID to `apps/web/.env.local`
4. Generate cookie password: `openssl rand -base64 32`

## Commands

| Command                     | Description                             |
| --------------------------- | --------------------------------------- |
| `bun run dev`               | Start web + Convex dev servers          |
| `bun run dev:web`           | Start only the web app                  |
| `bun run dev:convex`        | Start only Convex                       |
| `bun run dev:cli`           | Watch CLI in dev mode                   |
| `bun run dev:extension`     | Watch extension (for VS Code debugging) |
| `bun run build`             | Build all apps                          |
| `bun run build:web`         | Build only the web app                  |
| `bun run build:cli`         | Build only the CLI                      |
| `bun run build:extension`   | Build the extension                     |
| `bun run package:extension` | Package extension as `.vsix`            |
| `bun run lint`              | Lint all workspaces                     |
| `bun run typecheck`         | Typecheck all workspaces                |
| `bun run format:check`      | Check formatting                        |
| `bun run format:fix`        | Fix formatting                          |

## Per-App Workflows

### Web App (`apps/web/`)

```bash
bun run dev           # Start web + Convex
bun run build:web     # Production build
bun run test:e2e      # Run Playwright E2E tests
```

### CLI (`apps/cli/`)

```bash
bun run build:cli     # Build with tsup
cd apps/cli && bun test  # Run vitest tests
bun run dev:cli       # Watch mode
```

### VS Code Extension (`apps/vscode-extension/`)

```bash
bun run build:extension    # Build extension
bun run package:extension  # Create .vsix for install
bun run dev:extension      # Watch mode for debugging
```

To debug: run `bun run dev:extension`, open `apps/vscode-extension/` in VS Code, press F5.

To install locally: `code --install-extension apps/vscode-extension/env-connect-0.1.0.vsix`

## Path Aliases

- `@/*` maps to `apps/web/src/*` (web app imports)
- `@convex/*` maps to `convex/*` (Convex type imports from web app)

Example:

```typescript
import { api } from "@convex/_generated/api";
import { useProjects } from "@/hooks/useProjects";
```

## Troubleshooting

### Convex "deployment address undefined"

Missing `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local`.

### Convex "Could not find function"

Ensure `convex dev` is running. Run `bun run dev:convex` separately if needed.

### ESLint can't find `eslint-config-next`

Run `bun install` from the repo root to link workspace dependencies.

### Port 3000 in use

```bash
lsof -ti:3000 | xargs kill -9
```

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
