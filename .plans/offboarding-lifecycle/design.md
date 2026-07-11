# Access Exit & Security Hold — Design

**Status:** Designed, not started.
**Two primitives, deliberately separate:**

- **A. Removal** — membership ends (the org fired/offboarded them outside the
  app; the app only removes access). Cascades mostly exist; we add the exit
  UX and succession visibility.
- **B. Suspension (security hold)** — **the new primitive and main focus.**
  Membership STAYS, access is frozen org-wide and every device is wiped —
  for "his laptop leaked / machine compromised" incidents. Reinstate later
  with role and assignments intact.

Complements `.plans/access-revocation/` (env-scope narrowing of a user who
keeps access — parked). Sources: `.plans/access-revocation/current-model.md`

- login-path recon (refs inline).

---

## 1. What already exists (reuse, never rebuild)

| Capability                                                                                                | Where                                               |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Hierarchy gate (owner 4 > project_manager 3 > team_lead 2 > developer 1, actor strictly above target)     | `authz.ts` `assertCanManageUser`                    |
| Removal cascade: delete assignments, deactivate grants + device links + cliTokens, emit revocation events | `organizations.removeMember` (mutations.ts:531-702) |
| Real-time device teardown: extension unlinks project + deletes synced `.env`                              | `permissionRevocationEvents` → `realTimeSync.ts`    |
| WorkOS session revocation (CLI/extension device sessions)                                                 | `revokeMemberCliToken` / `revokeAllMemberSessions`  |
| Live per-request enforcement (denied at next fetch even if events never arrive)                           | `variables.listWithAccess`, `authz.ts`              |
| On-disk purge at uninstall                                                                                | ext v1.12.0 managed-files manifest                  |
| Owner-leaves block (transfer ownership first)                                                             | organizations mutations                             |

Gaps this feature fills: no member `status` (can't freeze without deleting),
no exit UX (removal today = hard delete at mutations.ts:528, org silently
vanishes; zero-org users get a blank "No active organization" page,
dashboard/page.tsx:64-78), no succession surface, no user-held-credential
sweep (API keys / service tokens they created), no CLI/extension revoked
messaging.

---

## 2. Primitive B — Suspension / security hold (CORE)

### 2a. State

`organizationMembers` gains:

```
status: v.optional(v.union(v.literal("active"), v.literal("suspended")))
suspendedAt?, suspendedBy?, suspendReason?   // reason: admin-only, audit
```

`undefined` ⇒ `"active"` (additive, no migration).

### 2b. Enforcement — NOT one choke point (learned during build)

The original assumption — "everything routes through `assertOrgAction` in
`lib/authz.ts`, so one guard there covers it" — was WRONG and a review
caught it. The `assert*` helpers guard the mutation/action paths, but the
highest-traffic **read** paths (variable/account/share list queries, project
visibility, vault value reads, project-access token validation, cross-org
search) each read `organizationMembers` INLINE with their own
`if (!membership) return <empty>` and never call the assert helpers. A guard
only in `authz.ts` left every one of those unguarded — a suspended member
kept listing variables and vaultRefs.

The real fix is TWO things:

1. `assertNotSuspended(membership)` inside the four `assert*` helpers +
   `getMyPermissions` (mutation/action paths) — throws `ACCESS_SUSPENDED`.
2. `getActiveMembership(ctx, orgId, userId)` — a shared helper that resolves
   membership and returns null if suspended — swapped into EVERY inline
   read-path gate so the guard can't be forgotten:
   `variables/{helpers,queries,rotation}.ts`, `accounts/queries.ts`,
   `sharing/{queries,helpers}.ts`, `projects/helpers.ts`,
   `users/projectAccess.ts` (inline `isSuspendedMembership`),
   `organizations/queries.ts` `getMembershipCore` (covers the
   `variables/values.ts` vault reads + fixes the who/why self-leak).

Lesson for the next feature: "single choke point" is only true if every
caller actually routes through it — grep for inline `organizationMembers`
reads before trusting it.

Web, CLI, extension, REST API, MCP, GitHub Action still get the uniform
`ACCESS_SUSPENDED` denial because they all bottom out in one of the guarded
helpers/reads.

### 2c. `suspendMemberAccess` mutation — freeze + wipe

Hierarchy-gated (`assertCanManageUser`); cannot target the owner; cannot
target self. Steps:

1. Patch membership `status: "suspended"` (+who/when/why). Deny is live
   from this instant (2b) — everything else is cleanup of residue.
2. Revoke ALL the target's WorkOS sessions — web, CLI, extension.
   (Build-time verify the revoke path covers the browser `sid`, not only
   cliTokens sids.)
3. Deactivate the target's `projectAccess` links + emit
   `permissionRevocationEvents` per linked project → extension (online or
   on next reconnect) unlinks and **deletes the synced `.env` files** —
   the wipe-the-laptop step, existing machinery.
4. Invalidate CLI residue: revocation events + denied-on-next-call cover
   it; run-cache serves nothing because every fetch re-authorizes.
5. **Credential sweep surface**: list `apiKeys` and CI/CD `serviceTokens`
   the target created (`createdBy`). These are ORG credentials that may
   live on the compromised machine — the suspend dialog shows them with
   opt-in "revoke these too" checkboxes (each revocation audited). Not
   automatic: they may be powering shared CI.
6. Audit `org.member_suspended`.

Keep: role, projectMembers rows, variable grants (all inert while
suspended — enforcement is upstream of all of them). That's the point:
reinstate restores the exact prior shape.

### 2d. `reinstateMemberAccess`

Hierarchy-gated. Patch `status: "active"`, audit `org.member_reinstated`.
Sessions were killed, so the user signs in fresh; extension re-links and
re-syncs on next use. Nothing else to rebuild — assignments and grants were
never touched.

### 2e. Suspended-user experience

- **Web**: dashboard layout resolves active org (layout.tsx:113-135); a
  membership with `status:"suspended"` renders a full-page hold screen —
  "Your access to _{org name}_ has been revoked. Please contact your
  organization." No data, no nav into the org; switcher still shows their
  OTHER orgs (suspension is per-org).
- **CLI**: any command against the org fails with the `access_suspended`
  error rendered as: `Access to <org> has been revoked. Contact your
organization administrator.` (map the error code in the CLI's error
  formatter — no new endpoint).
- **Extension**: revocation events already trigger unlink + file deletion
  - a warning notification; reuse with suspension wording.

---

## 3. Primitive A — Removal exit UX + succession

### 3a. Exit UX — tombstones

Removal today deletes the membership row and nothing tells the user. Add:

```
membershipTombstones {
  userId, organizationId,
  organizationName,          // snapshot — org may be deleted later
  kind: "removed" | "left" | "org_deleted",
  createdAt, acknowledged: boolean,
}   index by_user (userId, acknowledged)
```

- Written by removal, self-leave, org deletion. NOT by suspension (member
  still exists — 2e handles that state).
- Dashboard: unacknowledged tombstone ⇒ interstitial — "Your access to
  _{organizationName}_ has been revoked. Please contact your organization."
  Acknowledge → fall through to next org, or (zero orgs) a dedicated
  screen with a create-workspace CTA replacing the blank page.
- The removed user sees org name + date only — never who/why (audit log is
  for admins).
- Re-invite voids the tombstone. Cleanup cron deletes acknowledged
  tombstones after 30 days.
- CLI/extension: same `access_suspended`-style mapping for the
  membership-gone denial (`access_revoked` code) → same "contact your
  organization" message; extension already wipes via removal events.

### 3b. Succession — "anyone can slide into that place"

Structural fact: capability is org-role derived; owners implicitly cover
every project — a departure never creates a security orphan, only an ops
gap. So: **surface, never auto-reassign**; any member with the right role
can be slotted in afterwards, the app stays flexible.

| Change                  | Automatic (exists)                                       | Added surface                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer removed       | Assignments + grants die; variables they created persist | —                                                                                                                                                               |
| Team lead removed       | Grantee-side cascade only                                | Dialog shows "onboarded/granted N others" (`addedBy`/`grantedBy`) + audited opt-in revoke of those                                                              |
| Project manager removed | Same                                                     | **Coverage pre-flight**: projects where target is last assigned manager-level member → per-project successor picker or explicit "falls to owner" acknowledgment |
| Owner removed           | Blocked until ownership transfer                         | Unchanged                                                                                                                                                       |
| Demotion                | Live capability shrink                                   | Refetch revocation events per project so the extension scrubs now-out-of-scope keys; same coverage pre-flight                                                   |
| Promotion / replacement | Live widen                                               | None — add/promote successor first, then remove/demote predecessor; pre-flight enforces order naturally                                                         |

Queries: `listSubordinateGrants(orgId, userId)`, `listCoverageGaps(orgId,
userId)` (read-only, also reusable later as an "unmanaged projects" widget —
out of scope v1).

---

## 4. Edge-case matrix (→ one Playwright spec per row at build)

| #   | Case                                               | Expected                                                                                                    |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Suspend while a pull is in flight                  | Live enforcement denies (status read per request)                                                           |
| 2   | Suspended/removed laptop offline                   | Sessions dead server-side; on reconnect events fire → unlink + `.env` delete; every fetch denied regardless |
| 3   | Suspend → reinstate                                | Role, assignments, grants intact; user re-logs in; extension re-syncs                                       |
| 4   | Suspend owner / self                               | Blocked                                                                                                     |
| 5   | Suspend in one org                                 | Other orgs unaffected; switcher works                                                                       |
| 6   | Double suspend / concurrent suspend+remove         | Idempotent; remove of a suspended member works (removal supersedes)                                         |
| 7   | Suspended user's created API keys / service tokens | Listed in dialog; opt-in revoke; GitHub Action using a revoked token fails loudly (existing behavior)       |
| 8   | Suspended user hits web/CLI/extension              | "Access revoked — contact your organization {name}" on all three surfaces                                   |
| 9   | Removed user next login                            | Tombstone interstitial → acknowledge → next org or create-workspace screen                                  |
| 10  | Cookie points at removed/suspended org             | Existing `selectActiveOrganization` fallback + correct screen — no crash, no silent vanish                  |
| 11  | Removed team lead had onboarded others             | Default: they keep access; opt-in cascade audited                                                           |
| 12  | Removed last-assigned PM of running project        | Pre-flight successor pick or acknowledgment                                                                 |
| 13  | Re-invite after removal                            | Tombstone voided; audit shows removed→invited→joined                                                        |
| 14  | Org deleted after tombstone                        | Banner renders from name snapshot                                                                           |
| 15  | Self-leave                                         | Same cleanup + `kind:"left"`; blocked for last owner                                                        |
| 16  | Removal/suspension by peer or below                | Blocked (`assertCanManageUser`)                                                                             |
| 17  | Suspended user's open variable requests            | Held (deny is upstream); cancelled on removal                                                               |
| 18  | Open web tab at suspension moment                  | WorkOS session revoked → bounced to sign-in on next navigation; Convex subs die with session                |

---

## 5. Tier gating

Registry pattern per CLAUDE.md. Recommendation: exit UX + removal hygiene
**free** (trust story). `security_hold` (suspension, boolean) is a
defensible **pro** feature — it's an org incident-response tool — but
gating an emergency lockout has taste risk; decide at build.

## 6. Execution phases (when green-lit)

1. **Schema + choke point** — membership `status` + authz guard + error
   codes; tombstones table + write sites; cleanup cron. Additive deploy.
2. **Backend** — `suspendMemberAccess` / `reinstateMemberAccess`,
   credential-sweep + coverage + subordinate-grant queries, demotion
   refetch events. Convex-MCP verify on a scratch org.
3. **Clients/UX** — hold screen + tombstone interstitial + zero-org screen;
   members-page dialogs (suspend with sweep checklist, remove with
   pre-flight); CLI + extension error-code → "contact your organization"
   messages.
4. **Tests + ship** — Playwright per §4 row; full local suite; version
   bumps (web + CLI + extension minor, root); PR.

## 7. Non-goals

- Env-scope narrowing of an active user → `.plans/access-revocation/` (parked).
- Per-variable grant create/revoke mutations (separate).
- Automated triggers (impossible-travel detection, SCIM, inactivity holds).
- Auto-reassignment of the departed's role — humans pick successors.
