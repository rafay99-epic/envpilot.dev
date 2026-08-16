# React Doctor false positives

Findings that were investigated, rejected, and deliberately NOT suppressed in
`doctor.config.json`. They stay in the report on purpose: each depends on a
predicate about the route that a future change could invalidate, and a silent
config ignore would hide that.

Re-verify the predicate before dismissing the finding again.

## `nextjs-no-img-element` — the three organization-logo sites

`apps/web/src/app/(dashboard)/invitations/[token]/page.tsx`,
`app/(dashboard)/organizations/[slug]/page.tsx`,
`app/(dashboard)/organizations/page.tsx`

**Predicate:** all three render `organization.logoUrl`, which the update
route validates only as `z.string().url()` with no host restriction, so it
can be any https origin an owner pastes in. `next/image` refuses a `src`
whose hostname is not in `images.remotePatterns` and throws rather than
degrading, so converting these would break every org using a host we have
not listed. Widening `remotePatterns` to `**` is not an option either: that
turns the optimizer into an open image proxy.

The three sites that could convert did: the two member avatars and the
framework logos all come from hosts already in `remotePatterns`.

**Invalidated if:** logo uploads move to our own storage, or `logoUrl` gains
a host allowlist at the write path. Either would make these convertible, and
that is the real fix rather than a rendering change.

## `nextjs-no-side-effect-in-get-handler` — `apps/web/src/app/api/status/route.ts`

**Predicate:** the flagged side effect is an outbound `fetch` to the
UptimeRobot API, whose own protocol requires POST. Nothing in our system
mutates. The route is `force-static` with `revalidate = 300`.

**Invalidated if:** the handler starts writing to Convex, the vault, or a
cookie.

## `nextjs-no-side-effect-in-get-handler` — `apps/web/src/app/api/integrations/[provider]/start/route.ts`

**Predicate:** setting the OAuth `state` cookie and redirecting is the
standard authorization-start shape, and the route is behind `withAuth()`. The
residual risk is a prefetch overwriting a live state cookie mid-flow, not
CSRF against a mutation.

**Invalidated if:** the handler gains a side effect beyond the state cookie,
or the auth guard is removed.

## `effect-needs-cleanup` — `apps/web/src/hooks/useSplitScrollSync.ts:139`

Suppressed in `doctor.config.json` rather than listed here, because the
predicate is about the detector, not the route: the effect does return a
cleanup that removes every listener and disconnects the ResizeObserver, but
the add and remove calls sit inside a `for (const el of [pane, preview])`
loop that the detector cannot pair.

## `exhaustive-deps` — `apps/web/src/components/command-palette/command-palette.tsx`

**Predicate:** the finding's stated reason is that `openPalette` "is rebuilt
every render, so useEffect runs every time." This app sets
`reactCompiler: true`, and the component is compiler-managed, so the compiler
caches the function declaration and the identity is stable. The dependency is
already listed; the effect does not re-subscribe per render.

The obvious remedy is worse than the finding: wrapping `openPalette` in
`useCallback` is exactly the manual memoization that
`preserve-manual-memoization` flags as an error elsewhere in this codebase,
and CLAUDE.md rules it out because React Compiler is enabled.

**Invalidated if:** React Compiler is disabled for this app, or the component
starts bailing out again (any `try` with a finalizer, or without a `catch`,
anywhere in its body). Re-check with the CI scan, not a local one: the local
scan does not load the `react-hooks-js` plugin that reports compiler
bailouts.
