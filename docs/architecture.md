# Architecture

## Overview

Envpilot is a secure environment variable management platform with three client surfaces — a **Next.js web app**, a **CLI tool**, and a **VS Code extension** — managed as a **Bun workspaces + Turborepo** monorepo.

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

## Data Flow

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

## Client ↔ Server Relationship

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

## Authentication

1. User signs in via WorkOS AuthKit (email, OAuth, or SAML).
2. Callback route creates a session and syncs the user record to Convex.
3. Middleware protects all routes except explicitly public paths.

## Database

Convex serves as the real-time database. Sensitive values are **never** stored in Convex — only vault reference IDs. Actual secrets live in WorkOS Vault, encrypted at rest.

## Roles & Permissions

Three-tier RBAC defined in `apps/web/src/lib/auth.ts`:

| Role          | Capabilities                                                        |
| ------------- | ------------------------------------------------------------------- |
| **Admin**     | Full access: manage org, projects, variables, rollback, permissions |
| **Team Lead** | Manage projects and variables, grant/revoke per-variable access     |
| **Member**    | Read-only project access; variable access requires explicit grant   |

## Security

- All secret values encrypted at rest via WorkOS Vault
- Role-based access control with per-variable granularity
- Secure session management with encrypted cookies
- Comprehensive audit logging for compliance
- No plaintext secrets in the database
