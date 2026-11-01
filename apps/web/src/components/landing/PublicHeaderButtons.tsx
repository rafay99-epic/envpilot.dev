/**
 * Marketing header actions. Static on purpose: checking the session here
 * cost a /api/auth/me function call on every public page view. A signed-in
 * visitor who clicks sign-in is redirected to /dashboard by the route handler.
 */
export function PublicHeaderButtons() {
  return (
    <>
      <a
        href="/sign-in"
        className="text-xs text-ink-subtle transition-colors hover:text-accent"
      >
        sign-in
      </a>
      <a
        href="/sign-up"
        className="rounded border border-accent-line bg-accent-soft px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
      >
        get-started
      </a>
    </>
  );
}
