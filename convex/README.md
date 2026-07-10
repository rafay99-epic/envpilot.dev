# Convex backend

Envpilot's Convex backend, organized by feature.

## Layout

```
convex/
├── schema.ts            # database schema (must stay at root)
├── crons.ts             # scheduled jobs (must stay at root)
├── auth.config.ts       # WorkOS AuthKit JWT providers (must stay at root)
├── convex.config.ts     # installed components (rate-limiter, workflow, workpool)
├── <module>.ts          # ★ compat barrels — one per public module (see below)
├── lib/                 # shared pure helpers — NO registered functions
│   ├── identity.ts      #   verified-JWT actor resolution (requireAuthedUser)
│   ├── authz.ts         #   unified RBAC: roles, actions, assert*/get*Access
│   ├── authHelpers.ts   #   variable/account access wrappers
│   ├── audit.ts         #   createAuditLog + audit log helpers
│   ├── rateLimits.ts    #   rate limiter rules
│   ├── roleCompat.ts    #   legacy role validators
│   ├── seedData.ts      #   SEED_FEATURES (single source for registry seeding)
│   └── users.ts         #   batchGetUsers / user display helpers
└── features/            # ALL implementation code, by feature / sub-feature
    ├── auth/            #   getMyPermissions, resolveLegacyRoles
    ├── variables/       #   queries, mutations, rotation, values, share, requests/
    ├── accounts/        #   shared-account CRUD + credential values
    ├── permissions/     #   variablePermissions/, accountPermissions/, revocationEvents
    ├── sharing/         #   shared-secret links (queries, mutations, cleanup)
    ├── projects/        #   projects, members, favorites, tags, templates
    ├── organizations/   #   orgs, member sessions, invitations
    ├── users/           #   users, preferences, deviceSessions, projectAccess
    ├── billing/         #   subscriptions (queries, webhooks, checkout, gracePeriods), tierLimits
    ├── featureRegistry/ #   tier-gating registry (queries, resolver, gates)
    ├── admin/           #   admin panel backend, split by sub-feature + analytics
    ├── dashboard/       #   dashboard aggregate queries
    ├── audit/           #   audit log queries, security, compliance
    ├── community/       #   featureRequests/, changelog/
    ├── support/         #   contactMessages, supportTickets
    ├── emails/          #   Resend email actions + templates
    └── vault/           #   WorkOS Vault internal actions, GC, reveal
```

## Compat barrels (IMPORTANT)

Convex function paths are derived from file paths, and they are the wire
contract: the web app, admin panel, and **published CLI / VS Code extension
builds** call functions as `api.<module>.<fn>` / `internal.<module>.<fn>`.

Each root `<module>.ts` is a thin barrel that re-exports its feature's
registered functions (and helper exports), keeping every historical path
registered. Rules:

- **Never delete or rename a barrel or one of its exports** — that breaks
  deployed clients.
- New functions go in the feature directory and get re-exported from the
  matching barrel.
- Cross-feature imports go through the root barrels (e.g.
  `import { rateLimiter } from "../../rateLimits"`), keeping features
  decoupled from each other's internal layout.

See https://docs.convex.dev/functions for Convex function basics.
