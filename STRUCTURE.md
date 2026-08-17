# Structural findings

Problems that are not lint shapes and not one-line fixes. Each one is a
design that works but does not scale, found while doing other work and
parked here rather than widened into an unrelated PR.

Delete an entry when it ships.

---

## Creating a project from a template costs one HTTP request per variable

**Found:** 17 Aug 2026, while watching the dev server during the React Doctor
pass on PR #181.

**Where:** `apps/web/src/app/(dashboard)/dashboard/projects/new/page.tsx:138`
and `apps/web/src/app/api/variables/route.ts:104`

### What happens

The submit handler loops over the selected template's variables and posts each
one separately:

```ts
for (const variable of selectedTemplate.variables) {
  await fetch("/api/variables", { method: "POST", ... });
}
```

Every one of those requests rebuilds the same context before it does any
work. In `POST /api/variables`:

| Line | Call                          | Purpose                     |
| ---- | ----------------------------- | --------------------------- |
| 106  | `withAuth()`                  | session                     |
| 133  | `getOrCreateConvexUser`       | same user, every time       |
| 136  | `getProjectOrganization`      | same project, every time    |
| 145  | `checkOrganizationMembership` | same membership, every time |
| 160  | `createWithValue`             | the actual vault write      |
| 171  | `convex.query`                | read the row back           |

So the cost is roughly `variables x 6` sequential round trips, and only one
of the six is work that differs per variable. The Next.js Full Stack template
has 8 variables, which is about 48 round trips to create one project.

### Observed

Dev server, one project from the 8-variable template:

```
POST /api/variables 201 in 11.2s
POST /api/variables 201 in 26.2s
POST /api/variables 201 in 3.9s
POST /api/variables 201 in 1802ms
POST /api/variables 201 in 3.9s
POST /api/variables 201 in 5.4s
POST /api/variables 201 in 2.7s
POST /api/variables 201 in 1626ms
```

The user sits on "Creating..." for the whole run. Read those numbers as shape,
not as magnitude: the machine was also running a production build and two
full-repo React Doctor scans, and the 16x spread between the fastest and
slowest call is contention, not a code path that varies that much. Dev mode
also serves unminified with source maps and no warm route cache.

Production will be faster and much flatter. It will still be
`variables x 6` round trips.

### Why it is written this way

The loop is deliberate, and the comment above it says so: sequential to avoid
overwhelming the WorkOS Vault API with concurrent writes. That reasoning is
sound and should survive the fix. The problem is not the sequential vault
write, it is that the auth, user, project and membership lookups ride along
with it once per variable instead of once per project.

### Fix sketch

One request that takes the whole array:

- `POST /api/projects/:id/variables/batch`, or extend the existing route to
  accept `variables: [...]` alongside the current single-variable body.
- Resolve session, user, project and membership once.
- Keep the vault writes sequential inside the handler, so the concurrency
  concern in the original comment still holds.
- Run `findEnvironmentConflicts` across the incoming batch before writing
  anything, so a template that collides with an existing key fails before it
  half-applies. The per-variable path cannot see the batch today.
- Return per-variable results so a partial failure can be reported instead of
  swallowed. Right now each failure is caught per iteration and logged, and
  the user lands on a project quietly missing a variable.

Roughly 48 round trips becomes about 8.

### Related bug in the same path

`notifyVariableChange` (`route.ts:206`) sends one "variable created" email per
organization member, and it runs once per variable. Creating from an
8-variable template in a 5-member org sends 40 emails for a single action.

It is fire-and-forget so it does not add to the latency above, but it is worth
fixing in the same pass: the batch endpoint should send one summary email per
member, not one per variable.

### Testing

Project-from-template is a core flow, so this needs a Playwright spec in
`apps/web/tests/e2e/authenticated/` covering the happy path, a template whose
keys collide with existing variables, and a partial failure. The full local
suite is the gate of record, since e2e is disabled in CI.
