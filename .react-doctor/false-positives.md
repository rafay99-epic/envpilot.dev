# React Doctor false positives

Findings that were investigated, rejected, and deliberately NOT suppressed in
`doctor.config.json`. They stay in the report on purpose: each depends on a
predicate about the route that a future change could invalidate, and a silent
config ignore would hide that.

Re-verify the predicate before dismissing the finding again.

## `prefer-html-dialog` — three sites, none of them a straight swap

The rule's own validation says to "confirm that modal semantics are intended
before changing the element." Two of these three are not modals at all.

**`components/integrations/IntegrationsSection.tsx`** — the disconnect
confirmation is an inline strip rendered in flow under its row (`border-t`,
`sm:flex-row`), not an overlay. `<dialog>` is `display: none` until opened and
`showModal()` moves it to the top layer, which would tear it out of the row it
belongs to. `integrations.spec.ts` also locates it by
`getByRole("dialog", { name: 'Disconnect ...' })`.

**`components/dashboard/terminal-date-picker.tsx`** — a portaled popover
positioned from measured coordinates, with no backdrop and no focus trap by
design. Native `<dialog>` + `show()` would be defensible here, but the current
implementation is correct and the change buys only stacking context.

**`components/ui/modal.tsx`** — this one IS a real modal, and converting it is
the right long-term move, because it would bring a focus trap and focus
restoration that the hand-rolled version does not have. It is deliberately NOT
done in this PR: `Modal` backs four dialogs (confirm, audit export, variable
history, shortcuts help), the conversion replaces the backdrop div with
`::backdrop` and changes initial focus and stacking, and none of it can be
verified without a browser. Landing that blind in a PR this size is how you get
the random UI regressions this branch exists to remove.

**Follow-up worth its own PR:** `Modal` has no focus trap and no focus
restoration today, so a keyboard user can tab out of an open modal into the
page behind it. That is a genuine accessibility defect independent of which
element implements it.

## `no-loading-flag-reset-outside-finally` — three navigation handlers

`app/(dashboard)/dashboard/projects/[slug]/docs/new/page.tsx`,
`app/(dashboard)/organizations/new/page.tsx`,
`components/settings/project/Danger.tsx`

**Predicate:** all three already reset the flag inside `catch`, which is the
rule's own stated alternative ("or mirror it on every catch"). The stuck-flag
harm it describes cannot happen. On the success path the flag deliberately
stays set while `router.push`/`replace` navigates away, so the button cannot
re-fire mid-navigation.

Moving these into `finally` would be actively worse twice over: it would
re-enable the control during navigation, and React Compiler cannot lower a
`try` with a finalizer, so each one would bail the compiler out of its whole
component. That class of regression is what most of this branch was spent
removing.

**Invalidated if:** a `catch` stops resetting the flag, or the success path
stops navigating away.

## `motion-animate-presence-must-outlive-child` — `ApiKeysSection.tsx` snippet block

**Predicate:** `AnimatePresence` only tracks its DIRECT children. The
`m.div key="snippet"` is a direct child of this boundary, and the boundary
outlives every transition of the child's own condition (`showSnippet`), so
the exit animation runs correctly for every user-visible toggle.

The boundary is nested inside the `createdToken ? ... : ...` branch, which is
what the detector sees. Hoisting it above that ternary to satisfy the rule
would put four levels of markup between `AnimatePresence` and the `m.div`,
which stops it tracking the child at all and breaks the very animation the
rule exists to protect.

The sibling finding in `KeyRow` WAS real and is fixed: there the boundary was
gated on `!isRevoked` while its child was gated on `confirming`, so revoking a
key with the confirm strip open unmounted the boundary and the strip vanished
instead of animating out. Both conditions sit on the child now.

**Invalidated if:** the snippet stops being a direct child of its
`AnimatePresence`.

## `no-fetch-response-used-without-status-check` — five sites, all already handled

`app/api/integrations/[provider]/callback/route.ts` (x2),
`app/(dashboard)/dashboard/projects/[slug]/page.tsx`,
`app/(dashboard)/dashboard/variables/page.tsx`,
`components/integrations/IntegrationsSection.tsx`

**Predicate:** every one reads the body and then guards before using it, which
is the rule's own "deliberately handle the API's error payload" case. The
OAuth callback has to parse first: Slack returns HTTP 200 with `ok: false` on
rejection, so `response.ok` alone would miss it, and both providers carry the
message in `data.error`. All the parses use `.catch(() => null)` so a non-JSON
error page cannot throw past the guard. The project page additionally checks
`content-type` and `res.redirected` for the expired-session HTML redirect.

**Invalidated if:** any of these starts using a parsed field before its guard.

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
