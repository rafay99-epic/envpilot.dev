# Convex backend

Envpilot's Convex backend, organized by feature.

## Layout

```
convex/
├── schema.ts            # database schema (must stay at root)
├── crons.ts             # scheduled jobs (must stay at root)
├── auth.config.ts       # WorkOS AuthKit JWT providers (must stay at root)
├── convex.config.ts     # installed components (rate-limiter, workflow, workpool)
├── <module>.ts          # ★ 9 legacy client compat shims (see below) — nothing else
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

## Conventions

- **All code lives in `features/` (registered functions) or `lib/` (pure
  helpers).** New functions go directly in the right feature file and are
  called at their real path (`api.features.<feature>.<file>.<fn>`). There is
  no re-export/barrel step for new work.
- Cross-feature imports point at the real file (e.g.
  `import { rateLimiter } from "../../lib/rateLimits"`,
  `import { MAX_BULK_IMPORT_SIZE } from "../billing/tierLimits"`).

## Legacy client compat shims (the 9 root `<module>.ts` files)

Convex function paths are the wire contract for **published CLI
(>= 1.14.0) and VS Code extension (>= 1.7.2) builds**, which call exactly 16
functions by baked-in string refs like `"variables:listWithAccess"`. Each shim
re-exports only those functions to keep the old path registered. Rules:

- Do not add exports to a shim, and never import from one.
- CLI/extension source already uses the `features/*` paths, so releases after
  this refactor don't depend on the shims.
- **Removal:** once `minCli`/`minExtension` (apps/web/src/lib/versions.ts) are
  bumped past the last release using old paths, delete all 9 shim files.

See https://docs.convex.dev/functions for Convex function basics.
