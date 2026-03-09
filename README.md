# ENV Connect

Secure environment variable management for teams. ENV Connect provides a centralized platform for managing, sharing, and syncing environment variables across your development team and deployment environments.

## Features

- **Secure Variable Storage**: Environment variables encrypted and stored securely using WorkOS Vault
- **Real-Time Sync**: Changes propagate instantly across your team via Convex real-time database
- **Team Management**: Invite team members, assign roles, and control access
- **Organization Support**: Manage multiple organizations with separate projects
- **Granular Permissions**: Control who can view, edit, or manage each variable
- **Audit Logging**: Track all changes and access to environment variables
- **CLI Tool**: Manage variables from the command line
- **VS Code Extension**: Sync variables directly in your editor

## Tech Stack

- **Frontend**: [Next.js 16](https://nextjs.org/) with React 19 and the React Compiler
- **Backend**: [Convex](https://convex.dev/) real-time database
- **Authentication**: [WorkOS AuthKit](https://workos.com/docs/user-management)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Testing**: [Playwright](https://playwright.dev/)
- **Monorepo**: [Turborepo](https://turbo.build/) with [Bun](https://bun.sh/)
- **Language**: TypeScript with strict mode

## Monorepo Structure

```
root/
├── apps/
│   ├── web/                  # Next.js web app
│   ├── cli/                  # CLI tool (@env-connect/cli)
│   └── vscode-extension/     # VS Code extension
├── packages/
│   ├── shared-types/         # Common TypeScript interfaces
│   └── eslint-config/        # Shared ESLint presets
├── convex/                   # Convex backend
├── turbo.json                # Turborepo task pipeline
└── package.json              # Workspace root
```

## Quick Start

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Set up environment variables
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local with your configuration

# Start development (web + Convex)
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Commands

| Command                     | Description                        |
| --------------------------- | ---------------------------------- |
| `bun run dev`               | Start web app + Convex dev servers |
| `bun run dev:web`           | Start only the web app             |
| `bun run dev:convex`        | Start only Convex                  |
| `bun run dev:cli`           | Watch CLI in dev mode              |
| `bun run dev:extension`     | Watch extension for debugging      |
| `bun run build`             | Build all apps                     |
| `bun run build:web`         | Build only the web app             |
| `bun run build:cli`         | Build only the CLI                 |
| `bun run build:extension`   | Build only the extension           |
| `bun run package:extension` | Package extension as `.vsix`       |
| `bun run lint`              | Lint all workspaces                |
| `bun run typecheck`         | Typecheck all workspaces           |
| `bun run test`              | Run tests                          |
| `bun run test:e2e`          | Run Playwright E2E tests           |
| `bun run format:check`      | Check formatting                   |
| `bun run format:fix`        | Fix formatting                     |

## Environment Variables

Required in `apps/web/.env.local`:

| Variable                 | Description                       |
| ------------------------ | --------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Your Convex deployment URL        |
| `WORKOS_API_KEY`         | WorkOS API key                    |
| `WORKOS_CLIENT_ID`       | WorkOS client ID                  |
| `WORKOS_COOKIE_PASSWORD` | Cookie encryption key (32+ chars) |
| `NEXT_PUBLIC_APP_URL`    | Application URL                   |

## Documentation

- [Development Guide](./docs/DEVELOPMENT.md) - Local development setup and workflow
- [Deployment Guide](./docs/DEPLOYMENT.md) - Production deployment instructions

## Architecture

### Authentication Flow

1. User initiates sign-in via WorkOS AuthKit
2. WorkOS handles authentication (email, OAuth, SAML)
3. Callback route creates session and syncs user to Convex
4. Protected routes verify session via middleware

### Data Flow

1. Frontend components use Convex React hooks for real-time subscriptions
2. API routes use `ConvexHttpClient` for server-side queries
3. Sensitive values stored in WorkOS Vault (Convex stores vault reference IDs only)
4. Audit logs track all operations

### Security

- All sensitive values encrypted via WorkOS Vault
- Role-based access control (Admin, Team Lead, Member)
- Variable-level permissions
- Session management with secure cookies
- Comprehensive audit logging

## License

Private - All rights reserved
