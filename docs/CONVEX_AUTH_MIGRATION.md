# Convex Auth Migration — Binding Functions to Server-Verified Identity

**Status: FOUNDATION LAID (dormant). Cutover NOT executed.**

This document is the ordered plan to close the hole where **every Convex
function trusts a client-supplied `userId` arg**. Today any client that can
reach the public Convex deployment (the browser holds an unauthenticated
`ConvexReactClient` — see `apps/web/src/components/ConvexClientProvider.tsx`)
can call a public mutation and pass **any** `userId`, impersonating anyone.

The fix is to have Convex verify a WorkOS-issued JWT on each request and derive
the actor from `ctx.auth.getUserIdentity()` instead of a function arg.

> ⛔ **This migration CANNOT be completed without two things that are out of
> code scope:**
>
> 1. **A WorkOS JWT template** (dashboard action — user must create it) so
>    AuthKit issues Convex-verifiable JWTs with the right `iss`/`aud`.
> 2. **A live staging verification** of the JWT handshake
>    (`ctx.auth.getUserIdentity()` returning a real identity) before ANY
>    function is converted to require auth.
>
> Do not begin Phase 3 (function conversion) until both are green on staging.

---

## What already exists (this branch — additive, non-breaking)

| File                                | What it adds                                                                                        | Active? |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| `convex/auth.config.ts`             | Convex → WorkOS AuthKit provider config (`providers: [{ domain, applicationID }]`), env-driven.     | Inert   |
| `convex/identity.ts`                | `getAuthedUser(ctx)` / `requireAuthedUser(ctx)` — map JWT subject → `users` row via `by_workos_id`. | Unused  |
| `apps/web/src/lib/convex-client.ts` | `createAuthedConvexClient(token)` factory (per-request authed client). Singleton unchanged.         | Unused  |
| `.env.example`                      | Documents `WORKOS_JWT_ISSUER` and `WORKOS_CONVEX_APPLICATION_ID`.                                   | n/a     |

Nothing above changes an existing function signature, removes a `userId` arg,
or flips the browser provider. The app runs exactly as before.

---

## Phase 1 — WorkOS dashboard: issue Convex-verifiable JWTs (USER ACTION)

Convex verifies a JWT by fetching the issuer's JWKS and checking `iss` + `aud`.
AuthKit must therefore issue a JWT whose claims match `convex/auth.config.ts`.

1. **WorkOS Dashboard → Authentication → Sessions / JWT Template** (User
   Management). Confirm the **JWKS / issuer URL** for the environment. It looks
   like `https://api.workos.com/user_management/<WORKOS_CLIENT_ID>` and exposes
   JWKS at `<issuer>/.well-known/jwks.json`.
2. Create/adjust the **JWT template** so the access token carries:
   - `iss` = the issuer URL above.
   - `aud` = a stable audience string for Convex (recommended: the WorkOS
     client id, or a dedicated `convex` audience).
   - `sub` = **the WorkOS user id** (`user_...`). This MUST equal
     `users.workosId` — that is the join key `convex/identity.ts` uses. If the
     template namespaces the subject, normalize it in `getAuthedUser` before the
     lookup.
3. Map env vars (set in the **Convex deployment**, not `.env.local` — Convex
   functions read their own env):

   ```bash
   npx convex env set WORKOS_JWT_ISSUER          https://api.workos.com/user_management/<WORKOS_CLIENT_ID>
   npx convex env set WORKOS_CONVEX_APPLICATION_ID <aud value from the template>
   ```

   `convex/auth.config.ts` reads `WORKOS_JWT_ISSUER` → `domain` and
   `WORKOS_CONVEX_APPLICATION_ID` → `applicationID`.

4. **Deploy** (`npx convex deploy` / next `convex dev` push) so the deployment
   learns the trusted issuer. Still inert: no function reads identity yet.

**Verify (staging):** attach a token and call any query with a temporary probe
that logs `await ctx.auth.getUserIdentity()`. A non-null identity with the
expected `subject` = the JWT handshake works. **Do not proceed otherwise.**

---

## Phase 2 — Attach tokens (still no function requires auth)

### 2a. Browser: `ConvexProvider` → `ConvexProviderWithAuth`

`ConvexClientProvider.tsx` today wraps children in a plain
`ConvexProvider client={convex}` with an unauthenticated `ConvexReactClient`.
Swap the boundary to `ConvexProviderWithAuth` and feed it a `useAuth` hook that
returns the AuthKit token. Sketch:

```tsx
// useConvexAuthFromWorkOS.ts (new, client)
import { useCallback } from "react";
// AuthKit client hook exposing the access token (from @workos-inc/authkit-nextjs
// client entry) OR a fetch of /api/auth/me which already returns `accessToken`.
export function useConvexAuthFromWorkOS() {
  // isLoading/isAuthenticated derived from the AuthKit session
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      // Return the current WorkOS access token (JWT), refreshing if asked.
      // Simplest bridge: GET /api/auth/me and read `accessToken` (route already
      // returns it). Better: a dedicated /api/auth/convex-token endpoint that
      // returns only the token and supports force refresh.
      const res = await fetch("/api/auth/me", {
        cache: forceRefreshToken ? "no-store" : "default",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.accessToken as string | null) ?? null;
    },
    []
  );
  return { isLoading, isAuthenticated, fetchAccessToken };
}
```

```tsx
// ConvexClientProvider.tsx — boundary swap
import { ConvexProviderWithAuth } from "convex/react";
export function ConvexBoundaryProvider({ children }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useConvexAuthFromWorkOS}>
      {children}
    </ConvexProviderWithAuth>
  );
}
```

This is safe to ship **before** any function requires auth: functions still
accept `userId` and ignore the attached identity. It just means the browser now
_carries_ a token, unblocking Phase 3 batch-by-batch.

### 2b. Server: per-request authed client for auth-required calls

API routes use the **shared singleton** `convex` from
`apps/web/src/lib/convex-client.ts` (reused across 71+ routes). **Never call
`setAuth` on it** — it would leak identity across concurrent requests. Instead,
for a call that should run as the caller:

```ts
import { withAuth } from "@/lib/auth";
import { createAuthedConvexClient } from "@/lib/convex-client";

const { accessToken } = await withAuth();
const authed = createAuthedConvexClient(accessToken!);
await authed.mutation(api.variables.update, { ...argsWithoutUserId });
```

Routes keep using the singleton for non-auth reads. Convert a route to the
authed client only when the underlying function has been converted in Phase 3.

---

## Phase 3 — Convert functions (batched, staging-first)

**Mechanical change per function:**

1. Remove the actor arg from `args` (e.g. delete `userId: v.id("users")`,
   `requestingUserId`, or an `invitedBy`/`grantedBy` that is really "the actor").
2. At the top of the handler: `const actor = await requireAuthedUser(ctx);`
3. Replace every use of `args.userId` (the actor) with `actor._id`.
4. Leave `updatedBy`/`deletedBy`/`grantedBy`/`invitedBy` **stamp** columns as
   they are in the DB row — just source them from `actor._id` instead of the arg.
5. **Do NOT** remove `userId` args that name a **target/subject** user (e.g.
   "remove member `userId`", "grant to `userId`") — only the **actor** arg moves
   to `requireAuthedUser`. Every function must be inspected to tell actor from
   target; many take both.

**Caller updates each conversion forces:**

- **Web hook** (`apps/web/src/hooks/*`): drop the `userId` field from the
  `useMutation`/`useQuery` args.
- **API route** (`apps/web/src/app/api/**`): switch that call to
  `createAuthedConvexClient(accessToken)` and drop the actor arg (stop passing
  `getOrCreateConvexUser(...)._id` as the actor).
- **CLI route / Extension route**: see the bridge problem below — these do NOT
  hold WorkOS JWTs, so they need the internal-variant path, not a token.

### Actor-arg inventory (grepped on this branch)

Counts of `userId: v.id("users")` **argument occurrences** per Convex file
(excludes `schema.ts` and `_generated`). Not every occurrence is an _actor_ —
some are target/subject users — so each file needs manual actor-vs-target
triage during conversion:

| File                            | `userId: v.id("users")` args | Other actor-arg patterns present                                |
| ------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| `subscriptions.ts`              | 13                           | `createdBy`, `actorUserId`                                      |
| `variables.ts`                  | 7                            | `updatedBy`, `deletedBy`, `grantedBy`, `revokedBy`, `createdBy` |
| `permissions.ts`                | 7                            | `updatedBy`, `grantedBy`, `revokedBy`, `requestingUserId` (3)   |
| `users.ts`                      | 6                            | —                                                               |
| `projectAccess.ts`              | 6                            | `revokedBy`                                                     |
| `projectMembers.ts`             | 5                            | `updatedBy`, `revokedBy`, `requestingUserId` (6)                |
| `organizations.ts`              | 5                            | `updatedBy`, `revokedBy`, `invitedBy`, `createdBy`              |
| `sharedSecrets.ts`              | 4                            | `revokedBy`, `createdBy`                                        |
| `favorites.ts`                  | 4                            | —                                                               |
| `cliSessions.ts`                | 4                            | —                                                               |
| `userPreferences.ts`            | 3                            | —                                                               |
| `featureRequests.ts`            | 3                            | —                                                               |
| `emails.ts`                     | 3                            | `revokedBy`                                                     |
| `admin.ts`                      | 3                            | `createdBy`                                                     |
| `variableRequests.ts`           | 2                            | `grantedBy`, `createdBy`                                        |
| `permissionRevocationEvents.ts` | 2                            | `revokedBy`                                                     |
| `featureRegistry.ts`            | 2                            | `createdBy`                                                     |
| `auditHelpers.ts`               | 2                            | —                                                               |
| `projects.ts`                   | 1                            | `updatedBy`, `deletedBy`, `createdBy`                           |
| `invitations.ts`                | 1                            | `invitedBy`                                                     |
| `dashboard.ts`                  | 1                            | —                                                               |
| `authz.ts`                      | 1                            | (`getMyPermissions` query — actor)                              |
| `auditLogs.ts`                  | 1                            | —                                                               |
| `tags.ts`                       | 0                            | `updatedBy`, `deletedBy`, `createdBy`                           |
| `templates.ts`                  | 0                            | `updatedBy`, `deletedBy`, `createdBy`                           |
| `changelog.ts`                  | 0                            | `createdBy`                                                     |
| `tierLimits.ts`                 | 0                            | `createdBy`                                                     |

**Total `userId: v.id("users")` actor-arg occurrences: 91** across 23 files
(plus `schema.ts`'s 12 schema-column definitions, which are NOT function args
and stay). `authz.ts` also exposes the `getMyPermissions` public query whose
`userId` arg is the actor — convert it alongside.

`authz.ts` `assert*` helpers take `userId: Id<"users">` **as a Go-between param,
not a public arg**. They do not change signature; callers pass `actor._id`
instead of `args.userId`. This keeps the authorization core untouched.

### Batch order (highest risk first)

1. **RBAC + role/member mutations** — `organizations.ts` (role/member changes),
   `projectMembers.ts`, `permissions.ts` grants/revokes,
   `permissionRevocationEvents.ts`. These are the impersonation crown jewels.
2. **Secret mutations** — `variables.ts` (create/update/delete/rollback),
   `sharedSecrets.ts`.
3. **Access/token minting** — `projectAccess.ts`, `cliSessions.ts`
   (token minting), `invitations.ts`.
4. **Everything else** — `favorites.ts`, `userPreferences.ts`,
   `featureRequests.ts`, `variableRequests.ts`, `tags.ts`, `templates.ts`,
   `dashboard.ts`, `projects.ts`, `subscriptions.ts`, `admin.ts`, etc.

Convert one batch → deploy to staging → verify callers → then production.

---

## CLI / Extension bridge problem

The CLI and VS Code extension authenticate with **envpilot bearer tokens**
(minted via `cli-auth.ts` / `extension-auth.ts` / `cliSessions`), **NOT** WorkOS
JWTs. They never hold a Convex-verifiable identity token, so they cannot attach
one to a Convex request. If we naively convert their functions to
`requireAuthedUser`, every CLI/extension call breaks.

**Two options:**

- **A. Mint a short-lived Convex JWT** server-side for the resolved user after
  validating the bearer token, then call Convex with `createAuthedConvexClient`.
  Requires a signing key + a JWT-minting endpoint whose issuer is also trusted
  in `auth.config.ts`. More moving parts, more key management, more attack
  surface.
- **B. Route CLI/extension calls through `internalMutation` / `internalQuery`
  variants** invoked **only** from trusted Next.js API routes (which have
  already validated the bearer token and resolved the user via
  `getOrCreateConvexUser`). The route passes the resolved `userId` to the
  internal function; internal functions are unreachable from the public
  deployment, so the client-supplied-userId hole is closed for them too.

**Recommendation: B (internal variants).** The trust boundary is already the
Next.js API route — it authenticates the bearer token today. Internal functions
cannot be called by browsers/CLIs directly (Convex enforces this), so passing a
server-resolved `userId` into an `internalMutation` is safe. This avoids
standing up a second JWT issuer + signing-key rotation just for two clients, and
keeps the public/verified-JWT path (browser) clean. Keep a thin public wrapper
only where the browser also needs the function; the shared logic lives in an
internal helper called by both the JWT-verified public path and the
server-trusted internal path.

---

## Rollout / verification strategy

1. **Staging first.** Deploy `auth.config.ts` with real env vars to staging.
2. **Verify the JWT handshake** with a probe query logging
   `ctx.auth.getUserIdentity()` — confirm non-null identity + correct `subject`.
   Gate everything below on this.
3. **Ship Phase 2** (browser provider swap + token-carrying) — still no function
   requires auth. Confirm the app works identically.
4. **Convert in batches** in the risk order above. After each batch: staging
   deploy, exercise the converted flows through web + (via internal variants)
   CLI/extension, watch Convex logs for `Unauthenticated` throws.
5. **Keep internal variants** for server-trusted CLI/extension paths (Option B).
6. **Production** per batch once staging is clean.

**Rollback note:** because conversion is per-function, rollback is per-function.
If a converted function throws in production, revert that single function to its
prior signature (re-add the `userId` arg, drop `requireAuthedUser`) and redeploy
— `auth.config.ts`, `identity.ts`, and the browser provider can all stay in
place harmlessly. Until a function is converted, its old client-supplied-`userId`
behavior is fully intact, so partial rollout is always in a working state.
