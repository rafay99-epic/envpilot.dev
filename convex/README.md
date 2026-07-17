# Convex backend

Envpilot's Convex backend, organized by feature.

## Layout

```
convex/
├── schema.ts            # database schema (must stay at root)
├── crons.ts             # scheduled jobs (must stay at root)
├── auth.config.ts       # WorkOS AuthKit JWT providers (must stay at root)
├── convex.config.ts     # installed components (rate-limiter, workflow, workpool)
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

## Legacy client compat shims — REMOVED

The 11 root `<module>.ts` shim files (deviceSessions, featureRegistry,
organizations, permissionRevocationEvents, projectAccess, projectMembers,
projects, tierLimits, variableRequests, variables, variableValues) kept
legacy string paths like `"variables:listWithAccess"` registered for
published CLI < 1.18.0 and extension < 1.15.0 builds. They were deleted in
the same release that raised `minCli`/`minExtension`
(apps/web/src/lib/versions.ts) to 1.18.0 / 1.15.0 — the first builds that
call the real `features/*` paths — so no supported client depends on the
old paths. Blocked clients get an upgrade prompt, not a missing-function
error. If a path must ever come back, restore the shim from git history;
never re-export from feature modules at the root.

See https://docs.convex.dev/functions for Convex function basics.
