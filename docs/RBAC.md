# Unified Role-Based Access Control

Envpilot uses **one role per user**, stored on `organizationMembers.role`. What
a user can do in a project is a function of their org role plus whether they
are **assigned** to the project (`projectMembers` — a pure scope assignment,
no per-project role). Per-variable sharing is a **grant**
(`variablePermissions`: `read` | `write`), not a role.

Source of truth: `convex/authz.ts` (`ORG_ACTIONS`, `PROJECT_ACTIONS`).
Web mirror: `apps/web/src/lib/roles.ts`.

## Roles

| Role              | Level | Scope                                                                                                                                                                |
| ----------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner`           | 4     | Everything, org-wide. Implicit access to every project. Billing, settings, role changes, deletes, rollback.                                                          |
| `project_manager` | 3     | Full control of **assigned** projects (can be many): members, variables, grants. Creates projects. Sessions, audit, and analytics views.                             |
| `team_lead`       | 2     | Assigned project(s): variable CRUD, add/remove developers, grant per-variable read/write. Invites developers.                                                        |
| `developer`       | 1     | Assigned project(s): creates variables (auto-granted write on them), edits variables they hold a write grant on, views granted variables, submits variable requests. |

Per-variable **viewer sharing**: any org member — even without a project
assignment — can be granted access to a specific variable. Unassigned users
are always capped at read.

## Environment scoping (developers)

A developer's project assignment can carry an environment scope
(`projectMembers.environments`, e.g. `["development", "staging"]`). Subset
semantics: a variable is accessible only if **all** of its environments are
inside the scope — a variable tagged `production` is invisible and untouchable
(no metadata, no search hits, no grants override it), and a scoped developer
cannot create variables in, or move variables into, excluded environments.
Absent scope = unrestricted. Scope never applies to owners/PMs/team leads.

Set it in the invite panel (role Developer + projects selected), when adding a
developer to a project, or via the edit control on the project members page
(`projectMembers.setMemberEnvironments`). Changes log the
`project.member_environments_changed` audit action.

## Audit logging

Every state-changing mutation writes an `auditLogs` entry via
`convex/auditHelpers.ts` (`createAuditLog` and friends). When adding a
mutation, add a log call; if no existing action literal fits, extend the
`auditLogs.action` union in `convex/schema.ts` (naming:
`resource.verb_past_tense`) plus the severity/resource maps in
`auditHelpers.ts`, and add display labels in
`apps/web/src/components/audit/AuditLogList.tsx`,
`dashboard/audit/page.tsx`, and `dashboard/page.tsx`.

## Rules of thumb

- Hierarchy is strict: you can only manage/invite/grant-to users **below**
  your level (owners are exempt and can assign anything, including co-owners).
- Owners bypass project assignment; everyone else needs a `projectMembers`
  row for project actions.
- Enforce on the backend with `assertOrgAction` / `assertProjectAction` /
  `getVariableAccess` from `convex/authz.ts` — never inline role comparisons.
- Normalize before comparing: legacy rows may still hold `admin`/`member`
  (`normalizeOrgRole` maps them to `owner`/`developer`).

## Data migration

Run the admin migration `migrate-unified-roles` (in `convex/admin.ts` →
`runMigration`). Idempotent. Mapping:

- org `admin` → `owner`
- org `team_lead` → `project_manager` (they had org-wide powers)
- org `member` with a legacy project-`manager` assignment → `team_lead`
- org `member` otherwise → `developer`
- pending invitations migrate the same way
- variable permission `admin` → `write`

Legacy literals remain in `convex/schema.ts` validators only so pre-migration
rows validate; new code never writes them.

## Legacy client compatibility

Installed CLI / VS Code extension builds hardcode the old role strings and
derive OS-level `.env` file protection from them. All `/api/cli/*` and
`/api/extension/*` responses translate via `toLegacyOrgRole` /
`toLegacyProjectRole` (`apps/web/src/lib/roles.ts`):

- `owner` → `admin`; `project_manager`/`team_lead` → `team_lead`;
  `developer` → `member`
- assigned PM/TL → project role `manager` (writable), assigned developer →
  `developer` (readonly-with-request), grant-only viewer → `viewer`
  (strict read-only)

Remove this layer only after the CLI and extension ship with the unified
model.
