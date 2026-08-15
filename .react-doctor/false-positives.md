# React Doctor false positives

Findings that were investigated, rejected, and deliberately NOT suppressed in
`doctor.config.json`. They stay in the report on purpose: each depends on a
predicate about the route that a future change could invalidate, and a silent
config ignore would hide that.

Re-verify the predicate before dismissing the finding again.

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
