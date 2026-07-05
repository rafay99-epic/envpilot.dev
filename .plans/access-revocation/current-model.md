# Access & Revocation — Current Model (as of 2026-07-06, post Stage 2)

Reference map of how access is modeled, computed, enforced, and revoked TODAY.
The design in `design.md` builds on this. All refs verified by direct read.

## 1. Data model (convex/schema.ts)

| Table                                    | Key fields                                                                                                                                      | Meaning                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizationMembers` (92-115)           | `organizationId`, `userId`, `role` (`owner`/`project_manager`/`team_lead`/`developer` + legacy `admin`/`member`)                                | **Single source of truth** for org-wide capability. Project capability is DERIVED from this role, not stored per-project. Indexes: by_organization, by_user, by_org_and_user. |
| `projectMembers` (160-182)               | `projectId`, `userId`, `environments?: string[]` (developer subset scope; undefined = unrestricted), `addedBy`, `addedAt`; legacy unused `role` | **Scope assignment** — "this user may act in this project". Owners never get a row (implicit everywhere).                                                                     |
| `variablePermissions` (336-371)          | `variableId`, `userId`, `permission` (read/write/admin-legacy), `grantedBy`, `grantedAt`, `expiresAt?`, `isActive`, `revokedAt?`, `revokedBy?`  | Independent per-variable grant. `grantedBy` recorded but NOT linked to the granter's continued membership.                                                                    |
| `accountPermissions` (418-448)           | mirror of variablePermissions                                                                                                                   | For shared `projectAccounts` (service-account creds). Has full grant/update/revoke mutations (variablePermissions does NOT).                                                  |
| `projectAccess` (453-477)                | `projectId`, `userId`, `accessToken` (internal handle, not a credential), `deviceId/Name`, `expiresAt`, `isActive`                              | Extension/CLI device-link SCOPING record.                                                                                                                                     |
| `permissionRevocationEvents` (1118-1142) | `accessToken`, `projectId`, `userId`, `reason`, `revokedBy`, `revokedAt`, `acknowledged`, `expiresAt` (24h TTL)                                 | Real-time fan-out row; extension subscribes via `listMine`. **Project/session granularity only — no environment or variable field.**                                          |
| `cliTokens` (1005-1045)                  | `userId`, `organizationId?`, `sessionId` (WorkOS sid), `clientType` (cli/extension), `deviceName`, `isActive`                                   | Device-session display/revoke record (post Stage 2). JWT never stored.                                                                                                        |

## 2. Effective-access computation (convex/authz.ts) — COMPUTED LIVE

Nothing is materialized/cached as "effective access". Every decision re-derives
from current rows on each call.

- `assertOrgAction` (239-272) — role vs `ORG_ACTIONS[action]`.
- `assertProjectAction` (280-342) — owners bypass; else need projectMembers row
  AND org role in `PROJECT_ACTIONS[action]`; returns `environmentScope`.
- `assertOrgMembership` (350-385), `assertCanManageUser`/`assertCanAssignRole`
  (396-428) — hierarchy "strictly below actor".
- `getVariableAccess` (496-558) / `getAccountAccess` (607-669) — the combine
  logic: owner→write; PM/team_lead assigned→write; developer assigned→env-scope
  check then per-variable grant; unassigned member w/ active grant→read-only.
- `isEnvironmentScopeAllowed` (221-227) — env-scope filter.
- `getMyPermissions` (678-761) — the one "what can I do" endpoint web/CLI/ext call.
- Role hierarchy levels: owner 4 > project_manager 3 > team_lead 2 > developer 1 (50-59).

## 3. Grant provenance

- Recorded: `variablePermissions.grantedBy/revokedBy`, `projectMembers.addedBy`,
  `organizationMembers.invitedBy`.
- NOT recorded: no `removedBy` on projectMembers; nothing chains a grant's
  validity to the granter's continued role. If the team_lead who granted a
  developer access is removed/demoted, the grant is untouched.
- `variablePermissions` has NO grant/revoke/update mutation (only queries +
  cleanup cron). Rows are created only by auto-grant (developer creates a
  variable → variables.ts:1416-1427; variable request approved →
  variableRequests.ts:661-670). The `permission.granted/revoked` audit enum
  values (schema.ts:689-690) exist but are NEVER inserted (dead path).

## 4. Cascades on removal TODAY (grantee-only)

- `organizations.removeMember` (531-702): revokes user's projectAccess + events;
  deactivates cliTokens; deletes all their projectMembers; deactivates their
  variablePermissions (as grantee). Hierarchy-gated.
- `projectMembers.removeMember` (304-427): deactivates the user's
  variablePermissions on the project, revokes projectAccess + events, deletes
  the projectMembers row.
- `projectMembers.setMemberEnvironments` (442-533): narrows/widens
  `environments`, audit-logs `project.member_environments_changed` — fires NO
  revocation event, touches no variablePermissions. **← env-revoke gap.**
- `organizations.remove` / `projects.remove` / `projects.move` — full cascade.
- **No cascade from granter→grantee anywhere.** Removing/demoting a manager does
  not touch grants they issued or others' assignments.

## 5. Real-time revocation propagation

- `permissionRevocationEvents` created at 10 sites: org delete (441), org member
  removal (618), admin single-session revoke (1051), revoke-all-sessions (1177),
  projectAccess.updateLastUsed/refresh self-heal (175, 254), unlinkExtension
  (450), project delete (473), project move (634).
- NOT created for: `setMemberEnvironments`, isolated variablePermissions
  deactivation, or role downgrade (`updateMemberRole`).
- Extension subscribes to `permissionRevocationEvents.listMine` +
  `projectAccess.listForCaller` (convex.ts:60-101, sync.ts:108-153) → drive
  full project unlink + local `.env` deletion (realTimeSync.ts:247-364). Third
  sub `variables.listMetadataByProject` triggers refetch ONLY when the project's
  `key:version` hash changes — NOT access-aware.
- **Critical gap:** env-scope narrowing / grant revocation change neither the
  revocation events nor the metadata hash → extension keeps now-unauthorized
  values on disk until the next manual sync. CLI is stateless (re-derives live
  every call) so it's unaffected server-side, but its local run-cache + written
  `.env` files can be stale.
- WorkOS session revocation (real IdP sign-out) only from
  revokeMemberCliToken/revokeAllMemberSessions → sessions route
  (revokeWorkosSessions). Whole-session, not scoped.

## 6. Enforcement points

- CLI `/api/cli/variables`, extension `/api/extension/variables` → verify JWT →
  `variables.listWithAccess` (live env-scope + grant filter, mirrors
  getVariableAccess) → `resolveLegacyRoles` for legacy client file protection.
- Fully live per request. Env-level enforcement exists as a live filter; there
  is NO env-level revocation event or session invalidation.

## Summary

(a) Access = computed live. (b) Provenance partial (grantedBy/addedBy), not
chained to validity. (c) Cascade = grantee-only; no down-hierarchy cascade.
(d) No env-level revocation event. (e) Revocation reaches clients via WorkOS
session kill (coarse) + Convex reactive subs (project/session granularity).
(f) Top gaps: no variablePermissions grant/revoke mutation; no
provenance-aware cascade; no real-time signal for env/grant-level changes
(extension `.env` retains unauthorized values).
