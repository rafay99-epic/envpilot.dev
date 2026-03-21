<p align="center">
  <img src="assets/logo.png" alt="Envpilot" width="120" />
</p>

<h1 align="center">Envpilot</h1>

<p align="center">
  Secure environment variable management for teams.
  <br />
  <a href="https://www.envpilot.dev">Website</a> &middot; <a href="./docs/DEVELOPMENT.md">Development Guide</a> &middot; <a href="./docs/DEPLOYMENT.md">Deployment Guide</a>
</p>

---

## Overview

Envpilot is a centralized platform for managing, sharing, and syncing environment variables across development teams and deployment environments. It ships as three client surfaces — a **web dashboard**, a **CLI**, and a **VS Code extension** — backed by a real-time database and encrypted vault storage.

## Key Features

- **Encrypted Storage** — Secret values are encrypted at rest in WorkOS Vault. The database stores only vault reference IDs, never plaintext.
- **Real-Time Sync** — Changes propagate instantly to every connected client via Convex subscriptions.
- **Role-Based Access Control** — Three-tier RBAC (Admin, Team Lead, Member) with granular per-variable permissions.
- **Organization & Project Hierarchy** — Manage multiple organizations, each with isolated projects and environments.
- **Audit Logging** — Every read, write, and permission change is recorded for compliance.
- **CLI & VS Code Extension** — Pull, push, and diff variables directly from your terminal or editor.
- **Billing & Tier Limits** — Optional Polar.sh integration with enforceable Free / Pro tier caps.

## Tech Stack

| Layer              | Technology                                            |
| ------------------ | ----------------------------------------------------- |
| **Web App**        | Next.js 16, React 19, React Compiler, Tailwind CSS v4 |
| **Backend**        | Convex (real-time database), WorkOS Vault (secrets)   |
| **Authentication** | WorkOS AuthKit (email, OAuth, SAML)                   |
| **Billing**        | Polar.sh (optional)                                   |
| **Email**          | Resend (optional)                                     |
| **CLI**            | Commander.js, Zod v4, tsup                            |
| **VS Code Ext.**   | VS Code Extension API, esbuild                        |
| **Monorepo**       | Bun workspaces, Turborepo                             |
| **Testing**        | Playwright (E2E), Vitest (unit)                       |
| **Language**       | TypeScript (strict mode)                              |

## Prerequisites

- [Bun](https://bun.sh/) v1.3.10 or later
- [Node.js](https://nodejs.org/) 18.x or later (for CLI compatibility)
- A [Convex](https://convex.dev/) project
- A [WorkOS](https://workos.com/) account (API key + Client ID)

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/rafay99-epic/envpilot.dev.git
cd envpilot.dev

# 2. Install dependencies
bun install

# 3. Create environment files and symlinks
bun run setup

# 4. Edit .env.local with your credentials (see Environment Variables below)

# 5. Start development servers (Next.js + Convex)
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the web dashboard.

## Environment Variables

Copy `.env.example` to `.env.local` at the monorepo root. The web app reads it via a symlink.

### Required

| Variable                 | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL                          |
| `CONVEX_DEPLOYMENT`      | Convex deployment identifier                   |
| `WORKOS_API_KEY`         | WorkOS API key                                 |
| `WORKOS_CLIENT_ID`       | WorkOS client ID                               |
| `WORKOS_COOKIE_PASSWORD` | Cookie encryption key (32+ characters)         |
| `NEXT_PUBLIC_APP_URL`    | Application URL (e.g. `http://localhost:3000`) |
| `WORKOS_REDIRECT_URI`    | OAuth redirect URI                             |

### Optional

| Variable                          | Description                            |
| --------------------------------- | -------------------------------------- |
| `POLAR_ACCESS_TOKEN`               | Polar.sh access token                  |
| `POLAR_WEBHOOK_SECRET`            | Polar.sh webhook signing secret        |
| `NEXT_PUBLIC_PAYMENTS_ENABLED`    | Set `true` to enable billing           |
| `NEXT_PUBLIC_ENFORCE_TIER_LIMITS` | Set `true` to enforce tier caps        |
| `RESEND_API_KEY`                  | Resend API key for transactional email |
| `FROM_EMAIL`                      | Sender address for outbound email      |

## Available Scripts

All commands are run from the monorepo root with `bun run`.

### Development

| Command                 | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `bun run dev`           | Start Next.js + Convex dev servers in parallel |
| `bun run dev:web`       | Start Next.js only                             |
| `bun run dev:convex`    | Start Convex only                              |
| `bun run dev:cli`       | CLI watch mode                                 |
| `bun run dev:extension` | VS Code extension watch mode                   |

### Build

| Command                   | Description               |
| ------------------------- | ------------------------- |
| `bun run build`           | Build all apps            |
| `bun run build:web`       | Build web app only        |
| `bun run build:cli`       | Build CLI only            |
| `bun run build:extension` | Build & package extension |

### Quality

| Command                | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `bun run lint`         | ESLint across all workspaces                         |
| `bun run typecheck`    | TypeScript type-check all workspaces                 |
| `bun run format:check` | Prettier check                                       |
| `bun run format:fix`   | Prettier auto-fix                                    |
| `bun run check:all`    | Full CI pipeline (lint + typecheck + build + format) |

### Testing

| Command            | Description                     |
| ------------------ | ------------------------------- |
| `bun run test:e2e` | Playwright E2E tests (Chromium) |
| `bun run test:cli` | Vitest unit tests for CLI       |

### Deployment

| Command                     | Description                              |
| --------------------------- | ---------------------------------------- |
| `bun run convex:deploy`     | Deploy Convex functions to production    |
| `bun run publish:cli`       | Publish CLI to npm                       |
| `bun run publish:extension` | Publish extension to VS Code marketplace |

## Project Structure

```
envpilot/
├── convex/                        # Convex backend functions & schema
│   ├── schema.ts                  # Database schema definition
│   └── *.ts                       # Queries, mutations, actions
│
├── apps/
│   ├── web/                       # Next.js web dashboard
│   │   ├── src/
│   │   │   ├── app/               # App Router (pages + API routes)
│   │   │   ├── components/        # React components
│   │   │   ├── hooks/             # Custom hooks (Convex wrappers)
│   │   │   ├── lib/               # Auth, vault, polar, email, tier-limits
│   │   │   └── stores/            # Zustand state stores
│   │   └── tests/e2e/             # Playwright test specs
│   │
│   ├── cli/                       # CLI npm package (@envpilot/cli)
│   │   └── src/
│   │       ├── commands/          # CLI commands
│   │       └── lib/               # CLI utilities
│   │
│   └── vscode-extension/          # VS Code extension (envpilot)
│       └── src/
│           ├── providers/         # Tree view providers
│           ├── services/          # Extension services
│           └── ui/                # VS Code UI components
│
├── packages/                      # Shared configuration
│   ├── tsconfig/                  # TypeScript base configs
│   ├── eslint-config/             # ESLint shared config
│   └── prettier-config/           # Prettier shared config
│
├── docs/                          # Documentation
│   ├── DEVELOPMENT.md             # Local development guide
│   └── DEPLOYMENT.md              # Production deployment guide
│
├── turbo.json                     # Turborepo pipeline config
├── package.json                   # Root workspace config
└── .env.example                   # Environment variable template
```

## Architecture

### Data Flow

```
Browser / CLI / Extension
        │
        ▼
  Next.js API Routes
        │
        ├──▶ Convex (real-time database)
        ├──▶ WorkOS Vault (encrypted secrets)
        ├──▶ WorkOS AuthKit (authentication)
        ├──▶ Polar.sh (billing)
        └──▶ Resend (email)
```

### Authentication

1. User signs in via WorkOS AuthKit (email, OAuth, or SAML).
2. Callback route creates a session and syncs the user record to Convex.
3. Middleware protects all routes except explicitly public paths.

### Database

Convex serves as the real-time database. Sensitive values are **never** stored in Convex — only vault reference IDs. Actual secrets live in WorkOS Vault, encrypted at rest.

### Roles & Permissions

| Role          | Capabilities                                                        |
| ------------- | ------------------------------------------------------------------- |
| **Admin**     | Full access: manage org, projects, variables, rollback, permissions |
| **Team Lead** | Manage projects and variables, grant/revoke per-variable access     |
| **Member**    | Read-only project access; variable access requires explicit grant   |

## Documentation

- [Development Guide](./docs/DEVELOPMENT.md) — Local setup, conventions, and workflow
- [Deployment Guide](./docs/DEPLOYMENT.md) — Production deployment instructions

## Security

- All secret values encrypted at rest via WorkOS Vault
- Role-based access control with per-variable granularity
- Secure session management with encrypted cookies
- Comprehensive audit logging for compliance
- No plaintext secrets in the database

## License

This project is proprietary software. See [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built by the Envpilot team &middot; <a href="https://www.envpilot.dev">envpilot.dev</a>
  <br />
  <sub>Developed at <a href="https://syntaxlabtechnology.com">Syntax Lab Technology</a> &middot; Lead dev <a href="https://rafay99.com">rafay99.com</a></sub>
</p>
