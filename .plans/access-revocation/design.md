# Granular Access Revocation — Design & Execution Plan

**Status:** Designed, not started. Build AFTER Stage 3 (Vault → Convex actions).
**Decisions:** locked with the product owner (2026-07-06).
**Prereqs:** Stage 1 (JWT identity) + Stage 2 (device-flow CLI/extension, real-time
`listMine`/`listForCaller` subscriptions) — both merged. See `current-model.md`.

---

## 1. Problem & scope

Revoke a user's access at three scopes, cutting CLI + VS Code extension access
to that scope in real time, WITHOUT signing out the whole account (except
account-scope):

- **Account** — remove the user from the org: all projects/envs/sessions gone.
- **Project** — remove the user's access to one project: they keep the account
  and other projects.
- **Environment** — remove one environment (e.g. `production`) from a user's
  scope within a project: they keep the project's other envs.

**Out of scope (deferred):** per-VARIABLE grant create/revoke (the
`variablePermissions` grant/revoke mutations don't even exist yet — separate
feature), and time-boxed/expiring access.

## 2. Locked product decisions

1. **Cascade = surface + opt-in.** Removing or demoting a higher-role user NEVER
   auto-revokes the subordinates they onboarded/granted (no accidental
   mid-project lockout on a secrets platform). The removal UI SHOWS
   "this person onboarded/granted N others" and offers an audited
   "also revoke these" checkbox. Structural same-user cascade stays automatic
   (remove a user's project assignment → their grants in that project go).
2. **Env revoke = active local scrub.** On env-scope revocation the extension
   receives a scoped event and immediately deletes/blanks the now-unauthorized
   environment's keys from already-synced local `.env` files. CLI is stateless
   (denied on next pull); also invalidate its local run-cache for that project/env.

## 3. Key reframing

- **Access** = membership/assignment (`organizationMembers.role`,
  `projectMembers` assignment, `projectMembers.environments` scope). Source of truth.
- **Sessions** = active devices (`cliTokens` record, `projectAccess` link).
- Revoking access edits membership → propagates to sessions via
  `permissionRevocationEvents`. Enforcement is ALWAYS live (defense in depth):
  even a session that hasn't received the event yet is denied at the next fetch.

---

## 4. Schema changes (convex/schema.ts)

### 4a. `permissionRevocationEvents` — make it scope-aware

Add (all optional, additive — existing project/session events keep working):

- `scope: v.optional(v.union(v.literal("project"), v.literal("environment"), v.literal("session")))`
  — defaults to "project" semantics when absent (back-compat).
- `environment: v.optional(v.string())` — the env removed, when `scope==="environment"`.
- `affectedKeys: v.optional(v.array(v.string()))` — optional: the variable keys
  the client should scrub for that (project, environment). If omitted, the
  client scrubs by re-deriving access (safer default; keys are an optimization).
- New index `by_user_scope` (`userId`, `scope`) if query patterns need it.

### 4b. `projectMembers` — provenance for cascade surfacing

Add `removedBy: v.optional(v.id("users"))`, `removedAt: v.optional(v.number())`
(soft-audit; rows are still deleted on removal, but record who for the audit log).
No hard requirement — the cascade "surface" reads `addedBy` +
`variablePermissions.grantedBy` which already exist.

### 4c. Audit — wire the dead enum values

`permission.granted` / `permission.revoked` exist in the schema enum but are
never inserted. Insert them from the new revoke mutations (below) so the audit
log reflects granular revocations.

---

## 5. Backend mutations (convex/) — all `requireAuthedUser`, hierarchy-gated

### 5a. `projectAccess`/`projectMembers`: `revokeProjectAccess`

Explicit "revoke a user's access to a project" — thin wrapper/rename over the
existing `projectMembers.removeMember` cascade, PLUS:

- Emit a `permissionRevocationEvents` row `{ scope:"project", userId, projectId, reason, revokedBy }`.
- Audit `project.access_revoked`.
- Guard: `assertCanManageUser(actor, target)`; last-manager warning surfaced to UI.

### 5b. `projectMembers.revokeEnvironmentAccess` (THE CORE NEW MUTATION)

Args: `{ projectId, userId (target), environment }`. Handler:

- `assertProjectAction(actor, projectId, "project:manage_members")` (or equivalent).
- `assertCanManageUser(actor, target)`.
- Load the target's `projectMembers` row; compute `newEnvironments =
currentEnvironments.filter(e => e !== environment)`. If the row had undefined
  (unrestricted) scope, materialize it to "all envs minus the revoked one".
- If `newEnvironments` becomes empty → this is effectively project revocation:
  either block ("use revoke project access") or auto-promote to project revoke
  (decide at build; recommend block with a clear error).
- Patch `projectMembers.environments = newEnvironments`.
- Deactivate the target's `variablePermissions` for variables that ONLY exist in
  the revoked env (optional refinement; env-scope filter already denies them live).
- Emit `permissionRevocationEvents` `{ scope:"environment", userId, projectId,
environment, reason, revokedBy }`.
- Audit `permission.revoked` + `project.member_environments_changed`.

### 5c. `restoreEnvironmentAccess` (symmetric re-grant, for the UI)

Widen `environments` back; audit `permission.granted`. No revocation event.

### 5d. Cascade surfacing helpers (queries, read-only)

- `listSubordinateGrants({ organizationId, userId })` → for the removal UI: the
  set of {projectMembers this user `addedBy`, variablePermissions this user
  `grantedBy`} that are still active — "this person onboarded/granted N others".
- The removal mutations (`organizations.removeMember`, `updateMemberRole`
  demotion) accept an optional `cascadeGrantIds` / `cascadeMemberIds` array; when
  provided (admin ticked the box), they ALSO deactivate those grants /
  remove those assignments (each hierarchy-gated) and emit scoped events. When
  omitted (default), behavior is exactly as today (no down-cascade).

### 5e. Role downgrade (`updateMemberRole`) — emit a refetch event

On a downgrade (e.g. PM→developer) the user's own effective access shrinks. Emit
a `permissionRevocationEvents` `{ scope:"project" }` (or a lighter "refresh"
event) for each project they're in so the extension re-derives access and scrubs
anything now out of scope. Live enforcement already denies; the event closes the
extension `.env` staleness gap.

---

## 6. Real-time propagation

### 6a. Extension (apps/vscode-extension/services/realTimeSync.ts, convex.ts)

- `listMine` already delivers revocation events. Extend the handler: branch on
  `event.scope`:
  - `session`/`project` → existing full-project unlink + `.env` delete.
  - `environment` → NEW: scoped scrub. Re-derive the caller's allowed keys for
    that (project, environment) via a metadata/access query (or use
    `affectedKeys`), and delete/blank ONLY those keys from the synced `.env`
    file(s) for that env. Do NOT unlink the whole project.
- After scrub, acknowledge via `acknowledgeMine({ eventIds })`.

### 6b. CLI (apps/cli)

- Stateless server-side (re-derives live). On a scoped event it can't subscribe
  (no long-lived process), but its local `run-cache` + last-written `.env` may be
  stale. Add: on `pull`/`run`, the vault route response already reflects live
  access, so the written file is correct going forward. Add a `run-cache`
  invalidation keyed on (projectId, environment) fingerprint so a revoked env is
  re-fetched (and comes back empty/denied) rather than served from cache.

### 6c. Enforcement (already live — verify, don't rebuild)

`variables.listWithAccess` + `resolveLegacyRoles` re-derive env-scope + grants
per request. Add tests that a revoked env returns zero variables for that env.

---

## 7. Web UI (apps/web)

- **Per-member "Access" panel** (extend `organizations/[slug]/members/page.tsx`
  and/or the project members drawer): show the member's projects and, per
  project, their environment scope as toggles. Toggling off an env →
  `revokeEnvironmentAccess`; removing a project → `revokeProjectAccess`.
- **Removal flow**: when removing/demoting a manager, call
  `listSubordinateGrants` and render "This person onboarded/granted N others"
  with a checkbox "Also revoke their access" (passes `cascade*` ids).
- **Active sessions** (Settings): already lists CLI/extension devices; add
  per-device revoke (already flagged as a small follow-up) so account/session
  revocation is complete self-service.
- Gate all controls with the existing `<FeatureGate>` + `assertCanManageUser`
  hierarchy (a team_lead can't revoke a PM).

## 8. Feature registry / tier gating

Per CLAUDE.md: if granular revocation is a gated feature, add
`granular_access_revocation` (boolean) to `SEED_FEATURES` + tier overrides +
`admin.ts` mirror; enforce with `checkBooleanFeature` in the mutations and
`<FeatureGate>` in the UI. (Decide at build whether it's free or pro.)

---

## 9. Edge-case matrix (→ Playwright e2e, one spec per row)

| Case                               | Expected                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Remove developer                   | Their assignment + grants + sessions gone (exists)                                                 |
| Remove team_lead, no cascade       | Developers KEEP access (default)                                                                   |
| Remove team_lead, cascade ticked   | Developers they onboarded/granted also revoked, audited                                            |
| Remove project_manager             | Team leads + developers KEEP access unless cascaded; last-manager warning if none remain           |
| Demote PM→developer                | Their mgmt capability gone (live); own access shrinks to developer scope; extension refetches      |
| Narrow env (remove `production`)   | Extension scrubs prod keys from local `.env`; CLI next pull denied for prod; other envs unaffected |
| Revoke last remaining env          | Blocked with "use revoke project access" (or auto-promote — decide)                                |
| Revoke project access              | CLI/extension drop the project; account + other projects intact                                    |
| Revoke while a pull is in flight   | Live enforcement wins — fetch denied                                                               |
| Revoke someone at/above your level | Blocked (assertCanManageUser)                                                                      |
| Remove owner                       | Must transfer ownership first (exists)                                                             |
| Re-grant after revoke              | Works; audit shows granted→revoked→granted                                                         |
| Account revoke                     | All projects/envs/sessions gone + WorkOS session killed (Stage 2)                                  |

## 10. Execution phases

1. **Schema + events** — extend `permissionRevocationEvents` (scope/environment/
   affectedKeys); wire `permission.granted/revoked` audit. Deploy, verify additive.
2. **Backend mutations** — `revokeEnvironmentAccess` (core), `revokeProjectAccess`
   (explicit wrapper), `restoreEnvironmentAccess`, `listSubordinateGrants`,
   cascade args on removal/demotion, downgrade refetch event. Unit-verify each
   with the Convex MCP against a scratch org.
3. **Real-time** — extension scoped-env scrub in `realTimeSync.ts`; CLI run-cache
   invalidation. Verify with a real JWT: narrow env → event → scrub.
4. **Web UI** — per-member Access panel, cascade surface at removal, per-device
   session revoke.
5. **Tests + polish** — Playwright e2e for every row in §9; `check:all`;
   version bumps (web + convex-touching → root); PR.

## 11. Non-goals / follow-ups

- Per-variable grant create/revoke (needs the missing `variablePermissions`
  grant/revoke mutations — separate feature).
- Time-boxed/expiring access (`variablePermissions.expiresAt` exists, unused here).
- Auto-cascade or provenance-chained validity (explicitly rejected in favor of
  surface + opt-in).

## 12. Risks

- **Extension scrub correctness** — deleting keys from a user's `.env` is
  destructive; scope it precisely (only the revoked env's keys) and never touch
  keys the user still has access to. Heavy e2e here.
- **Empty-env-scope ambiguity** — decide block vs auto-promote-to-project-revoke.
- **Cascade UI truthfulness** — `listSubordinateGrants` must reflect live state
  so the admin isn't shown stale "N others".
